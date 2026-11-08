import { AssignOwnersResult, ImportStatus, TokenPair } from '@purrshelf/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import { libraryItems } from '../../src/db/schema.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { LibraryImport, type WorkMatcher } from '../../src/modules/library/import.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import type { MetadataProvider, ProviderWork } from '../../src/modules/discover/types.js';
import { ISBN_HAVELAAR } from '../metadata-fakes.js';
import { PASSWORD, TestClock, login, makeTestApp, type TestContext } from '../helpers.js';
import { FakeCwa } from './fake-cwa.js';

let cwa: FakeCwa;
let adapter: CwaAdapter;
let database: DatabaseHandle;
let clock: TestClock;
let items: LibraryItems;
let users: UserRepository;
let me: string;
let partner: string;
const log = { warn: vi.fn() };

beforeEach(async () => {
  cwa = new FakeCwa();
  cwa.addBook({
    id: 10,
    title: 'Max Havelaar',
    authors: ['Multatuli'],
    identifiers: [{ type: 'isbn', val: ISBN_HAVELAAR }],
  });
  cwa.addBook({ id: 11, title: 'A Map of Quiet Rivers', authors: ['Bram Inkwell'] });
  cwa.addBook({ id: 12, title: 'The Lighthouse Cat', authors: ['Ada Quillfeather'] });
  adapter = cwa.adapter();
  database = openDatabase(':memory:');
  clock = new TestClock();
  items = new LibraryItems(database.db, clock.fn);
  users = new UserRepository(database.db, clock.fn);
  me = (await users.create({ username: 'a', displayName: 'Reader One', password: PASSWORD })).id;
  partner = (await users.create({ username: 'b', displayName: 'Reader Two', password: PASSWORD }))
    .id;
  log.warn.mockReset();
});

afterEach(() => {
  database.close();
  adapter.close();
  cwa.close();
});

/** Matches by title: Havelaar is a work, the map is not, the cat makes search fail. */
function matcher(): WorkMatcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    matchWork: async ({ title }) => {
      calls.push(title);
      if (title === 'The Lighthouse Cat') throw new Error('metadata down');
      return title === 'Max Havelaar' ? 'hardcover:101' : null;
    },
  };
}

function importer(m: WorkMatcher = matcher(), library: CwaAdapter | null = adapter) {
  return new LibraryImport(items, users, library, m, clock.fn, log);
}

describe('LibraryImport', () => {
  it('gives every Calibre book an item, then matches them to works in the background', async () => {
    const m = matcher();
    const run = importer(m);
    const started = await run.start(me);
    expect(started).toMatchObject({
      running: true,
      startedAt: clock.now.toISOString(),
      finishedAt: null,
      scanned: 3,
      added: 3,
      toMatch: 3,
    });
    expect(items.all()).toHaveLength(3);

    await run.idle();
    expect(run.status(me)).toMatchObject({
      running: false,
      finishedAt: clock.now.toISOString(),
      matched: 1,
      unmatched: 1,
      failed: 1,
    });
    expect(items.byCalibreId(10)?.workId).toBe('hardcover:101');
    expect(items.byCalibreId(11)?.workId).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ calibreBookId: 12 }),
      'import: matching a book failed',
    );
    expect(m.calls).toEqual(['Max Havelaar', 'A Map of Quiet Rivers', 'The Lighthouse Cat']);
  });

  it('is safe to re-run: items and owners stay, only books without a work are searched again', async () => {
    const m = matcher();
    const run = importer(m);
    await run.start(me);
    await run.idle();
    const havelaar = items.byCalibreId(10)!;
    items.own(havelaar.id, me);
    cwa.addBook({ id: 13, title: 'Salt and Lanterns', authors: ['Ilse Varenkamp'] });

    m.calls.length = 0;
    expect(await run.start(me)).toMatchObject({ scanned: 4, added: 1, toMatch: 3 });
    await run.idle();
    expect(m.calls).toEqual(['A Map of Quiet Rivers', 'The Lighthouse Cat', 'Salt and Lanterns']);
    expect(items.all()).toHaveLength(4);
    expect(items.byCalibreId(10)).toEqual(havelaar);
    expect(items.isOwner(havelaar.id, me)).toBe(true);
  });

  it('runs once at a time: starting again while matching just reports progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const m: WorkMatcher = { matchWork: vi.fn(async () => (await gate, null)) };
    const run = importer(m);
    await run.start(me);
    expect(await run.start(me)).toMatchObject({ running: true, toMatch: 3 });
    release();
    await run.idle();
    expect(m.matchWork).toHaveBeenCalledTimes(3);
  });

  it('finishes at once when every book already has a work', async () => {
    for (const id of [10, 11, 12])
      items.ensure({ workId: `hardcover:${id}`, calibreBookId: id, title: 'x' });
    const m = matcher();
    const run = importer(m);
    expect(await run.start(me)).toMatchObject({
      running: false,
      finishedAt: clock.now.toISOString(),
      scanned: 3,
      added: 0,
      toMatch: 0,
    });
    await run.idle();
    expect(m.calls).toEqual([]);
  });

  it('reads Calibre page by page', async () => {
    const find = vi.spyOn(adapter, 'findBooks');
    for (let id = 100; id < 600; id++) cwa.addBook({ id, title: `Book ${id}` });
    const run = importer({ matchWork: async () => null });
    expect(await run.start(me)).toMatchObject({ scanned: 503 });
    await run.idle();
    expect(find.mock.calls.map(([q]) => q.afterId)).toEqual([0, 596]);
  });

  it('stops matching on shutdown and does not start again', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = importer({ matchWork: async () => (await gate, 'hardcover:1') });
    await run.start(me);
    const stopped = run.stop();
    release();
    await stopped;
    expect(run.status(me)).toMatchObject({ running: false, matched: 1, unmatched: 0 });
    expect(await run.start(me)).toMatchObject({ running: false, scanned: 3 });
  });

  it('needs the library', async () => {
    await expect(importer(matcher(), null).start(me)).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
    });
  });

  it('lists the readers, the asking one first', async () => {
    await users.create({ username: 'c', displayName: 'Another Reader', password: PASSWORD });
    const names = (id: string) =>
      importer()
        .status(id)
        .readers.map((r) => [r.displayName, r.me]);
    expect(names(partner)).toEqual([
      ['Reader Two', true],
      ['Another Reader', false],
      ['Reader One', false],
    ]);
    expect(importer().status(me).readers[0]).toEqual({
      id: me,
      displayName: 'Reader One',
      me: true,
    });
  });

  it('assigns owners in bulk, replacing what was there and cancelling deletions', () => {
    const a = items.ensure({ workId: null, calibreBookId: 10, title: 'x' });
    const b = items.ensure({ workId: null, calibreBookId: 11, title: 'y' });
    items.own(a.id, partner);
    database.db.update(libraryItems).set({ deleteAfter: clock.fn() }).run();
    const run = importer();

    expect(run.assign({ itemIds: [a.id, b.id, a.id], ownerIds: [me, me] })).toEqual({
      updated: 2,
    });
    expect(items.owners([a.id, b.id])).toEqual(
      new Map([
        [a.id, [{ userId: me, displayName: 'Reader One' }]],
        [b.id, [{ userId: me, displayName: 'Reader One' }]],
      ]),
    );
    expect(items.all().map((i) => i.deleteAfter)).toEqual([null, null]);

    run.assign({ itemIds: [b.id], ownerIds: [me, partner] });
    expect(
      items
        .owners([b.id])
        .get(b.id)
        ?.map((o) => o.userId)
        .sort(),
    ).toEqual([me, partner].sort());
  });

  it('refuses unknown readers and books, changing nothing', () => {
    const a = items.ensure({ workId: null, calibreBookId: 10, title: 'x' });
    const run = importer();
    expect(() => run.assign({ itemIds: [a.id], ownerIds: ['nobody'] })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', details: { userId: 'nobody' } }),
    );
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect(() => run.assign({ itemIds: [a.id, ghost], ownerIds: [me] })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', details: { itemId: ghost } }),
    );
    expect(items.owners([a.id]).size).toBe(0);
    expect(items.byIds([])).toEqual([]);
  });
});

describe('import API', () => {
  let ctx: TestContext;
  let token: string;

  const work = (over: Partial<ProviderWork>): ProviderWork => ({
    provider: 'openlibrary',
    id: 'OL1W',
    title: 'x',
    subtitle: null,
    authors: [],
    language: 'en',
    series: null,
    publishedYear: null,
    isbns: [],
    coverUrl: null,
    ...over,
  });
  const provider: MetadataProvider = {
    name: 'openlibrary',
    configured: true,
    getWork: async () => null,
    search: async ({ title }) => {
      if (title === 'Max Havelaar') {
        return [
          work({ id: 'OL9W', title: 'Max Havelaar (a study)', authors: ['Someone Else'] }),
          work({ id: 'OL1W', title: 'Havelaar', authors: ['Multatuli'], isbns: [ISBN_HAVELAAR] }),
        ];
      }
      if (title === 'The Lighthouse Cat') {
        return [work({ id: 'OL2W', title: 'The Lighthouse Cat', authors: ['Ada Quillfeather'] })];
      }
      return [work({ id: 'OL3W', title: 'A Map of Loud Rivers', authors: ['Bram Inkwell'] })];
    },
  };

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    ctx.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  beforeEach(async () => {
    ctx = await makeTestApp({ library: adapter, metadataProviders: [provider] });
    token = TokenPair.parse((await login(ctx.app)).json()).accessToken;
  });
  afterEach(() => ctx.close());

  it('needs a login', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/api/v1/admin/import' })).statusCode).toBe(
      401,
    );
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/admin/import' })).statusCode).toBe(
      401,
    );
  });

  it('imports, matches by ISBN or title and author, and assigns owners', async () => {
    const before = ImportStatus.parse((await call('GET', '/admin/import')).json());
    expect(before).toMatchObject({ running: false, startedAt: null, scanned: 0 });
    expect(before.readers).toEqual([
      expect.objectContaining({ displayName: 'Reader One', me: true }),
    ]);

    const started = await call('POST', '/admin/import');
    expect(started.statusCode).toBe(200);
    expect(ImportStatus.parse(started.json())).toMatchObject({ scanned: 3, toMatch: 3 });

    const shared = new LibraryItems(ctx.database.db, ctx.clock.fn);
    await vi.waitFor(async () => {
      expect(ImportStatus.parse((await call('GET', '/admin/import')).json())).toMatchObject({
        running: false,
        matched: 2,
        unmatched: 1,
      });
    });
    expect(shared.byCalibreId(10)?.workId).toBe('openlibrary:OL1W');
    expect(shared.byCalibreId(11)?.workId).toBeNull();
    expect(shared.byCalibreId(12)?.workId).toBe('openlibrary:OL2W');

    const me = ctx.users.findByUsername('reader')!.id;
    const ids = shared.all().map((i) => i.id);
    const res = await call('PUT', '/admin/import/owners', { itemIds: ids, ownerIds: [me] });
    expect(AssignOwnersResult.parse(res.json())).toEqual({ updated: 3 });
    expect([...shared.owners(ids).values()].flat().map((o) => o.userId)).toEqual([me, me, me]);

    const empty = await call('PUT', '/admin/import/owners', { itemIds: ids, ownerIds: [] });
    expect(empty.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
