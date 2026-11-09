import type { LibraryState, WorkSeries, WorkSummary } from '@purrshelf/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import type { User } from '../../src/db/schema.js';
import { AppError } from '../../src/errors.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import { RecommendService } from '../../src/modules/recommend/service.js';
import { ReaderShelf } from '../../src/modules/recommend/shelf.js';
import { Dismissals, RowCache } from '../../src/modules/recommend/store.js';
import type { ReaderBook, WorkSource } from '../../src/modules/recommend/types.js';
import { PASSWORD, TestClock } from '../helpers.js';

/** RecommendService with fake works, shelves and library: the edges the API test doesn't reach. */

let database: DatabaseHandle;
let clock: TestClock;
let users: UserRepository;
let me: User;
let shelves: Map<string, { books: ReaderBook[]; readingData: boolean }>;
let works: WorkSource & { [K in keyof WorkSource]: ReturnType<typeof vi.fn> };
let library: Map<string, LibraryState>;
let log: { warn: ReturnType<typeof vi.fn> };

function summary(id: string, over: Partial<WorkSummary> = {}): WorkSummary {
  return {
    id,
    mediaType: 'ebook',
    title: `Title ${id}`,
    subtitle: null,
    authors: ['Ada Quillfeather'],
    language: 'en',
    series: null,
    publishedYear: 2020,
    isbns: [],
    hasCover: true,
    sources: [{ provider: 'hardcover', id: id.split(':')[1]! }],
    library: null,
    ...over,
  } as WorkSummary;
}

let nextId = 100;
function book(over: Partial<ReaderBook> & { finished?: boolean; at?: string } = {}): ReaderBook {
  const { finished, at, ...rest } = over;
  const id = nextId++;
  return {
    itemId: `item-${id}`,
    workId: `hardcover:${id}`,
    calibreBookId: id,
    title: `Owned ${id}`,
    authors: ['Ada Quillfeather'],
    series: null,
    isbns: [],
    languages: ['en'],
    tags: [],
    ownedAt: new Date('2025-06-01T00:00:00Z'),
    reading: {
      status: finished === false ? 'unread' : 'finished',
      progressPercent: null,
      spentReadingMinutes: null,
      remainingMinutes: null,
      lastModified: at ? new Date(at) : null,
    },
    ...rest,
  };
}

function service() {
  return new RecommendService({
    users,
    shelf: { books: async (u) => shelves.get(u.id) ?? { books: [], readingData: true } },
    works,
    library: {
      match: async (_u, candidates) =>
        new Map(
          candidates.flatMap((c) => (library.has(c.key) ? [[c.key, library.get(c.key)!]] : [])),
        ),
    },
    openRequests: () => new Map(),
    dismissals: new Dismissals(database.db, clock.fn),
    cache: new RowCache(database.db),
    clock: clock.fn,
    log: log as never,
  });
}

const unavailable = () => new AppError(502, 'METADATA_UNAVAILABLE', 'down');
const titles = (rows: { kind: string; items: { work: { title: string } }[] }[]) =>
  Object.fromEntries(rows.map((r) => [r.kind, r.items.map((i) => i.work.title)]));

beforeEach(async () => {
  database = openDatabase(':memory:');
  clock = new TestClock(new Date('2026-11-09T12:00:00Z'));
  users = new UserRepository(database.db, clock.fn);
  me = await users.create({ username: 'me', displayName: 'Reader One', password: PASSWORD });
  shelves = new Map();
  library = new Map();
  log = { warn: vi.fn() };
  works = {
    getWork: vi.fn(async (_u: string, id: string) => summary(id)),
    getSeries: vi.fn(async (): Promise<WorkSeries> => ({ series: null, entries: [] })),
    byAuthor: vi.fn(async () => [] as WorkSummary[]),
    matchWork: vi.fn(async () => null),
    workSummary: vi.fn(async () => ({ title: 'x', authors: ['Ada Quillfeather'] })),
  } as never;
});
afterEach(() => database.close());

describe('RecommendService: series', () => {
  it('matches a book without a work id first, and skips whole-number gaps and novellas', async () => {
    shelves.set(me.id, {
      readingData: true,
      books: [book({ workId: null, series: { name: 'Harbour Tales', index: 1 } })],
    });
    works.matchWork.mockResolvedValue('hardcover:1');
    works.getSeries.mockResolvedValue({
      series: null,
      entries: [
        { position: 1.5, work: summary('hardcover:15', { title: 'A Novella' }) },
        { position: null, work: summary('hardcover:99', { title: 'Box Set' }) },
        { position: 3, work: summary('hardcover:3', { title: 'Book Three' }) },
        { position: 2, work: summary('hardcover:2', { title: 'Book Two' }) },
      ],
    });
    const { rows } = await service().get(me.id);
    expect(titles(rows)).toEqual({ next_in_series: ['Book Two'] });
    // The seed's own series name when the provider gives none.
    expect(rows[0]!.items[0]!.reason).toMatchObject({ series: { name: 'Harbour Tales' } });
  });

  it('skips a series when the next book is mine, in another language, or unmatched', async () => {
    shelves.set(me.id, {
      readingData: true,
      books: [
        book({ series: { name: 'Mine Next', index: 1 } }),
        book({ series: { name: 'Dutch Next', index: 1 } }),
        book({ workId: null, series: { name: 'Unmatched', index: 1 } }),
        book({ series: { name: 'Gone', index: 1 } }),
      ],
    });
    library.set('hardcover:21', {
      itemId: 'i',
      owners: [{ id: me.id, displayName: 'x', me: true }],
      onMyKobo: false,
      reading: null,
    });
    works.getSeries.mockImplementation(async (_u: string, id: string) => {
      if (id === 'hardcover:104') throw new AppError(404, 'NOT_FOUND', 'gone');
      const next =
        id === 'hardcover:101'
          ? summary('hardcover:21', { library: library.get('hardcover:21')! })
          : summary('hardcover:22', { language: 'nl' });
      return {
        series: { id: null, name: 'S', total: null },
        entries: [{ position: 2, work: next }],
      };
    });
    const { rows } = await service().get(me.id);
    expect(rows).toEqual([]);
  });
});

describe('RecommendService: authors', () => {
  it('takes at most three per author, skips the middle of a series and other authors', async () => {
    shelves.set(me.id, {
      readingData: true,
      books: [book({ title: 'Read One' }), book({ authors: ['Bram Inkwell'] })],
    });
    works.byAuthor.mockImplementation(async (_u: string, author: string) =>
      author === 'Ada Quillfeather'
        ? [
            summary('hardcover:1', {
              title: 'Middle',
              series: { id: null, name: 'S', position: 3, total: null },
            }),
            summary('hardcover:2', { title: 'Oldest', publishedYear: null }),
            summary('hardcover:3', { title: 'Newer', publishedYear: 2024 }),
            summary('hardcover:4', { title: 'Newest', publishedYear: 2026 }),
            summary('hardcover:5', { title: 'Older', publishedYear: 2010 }),
            summary('hardcover:6', { title: 'Not Her', authors: ['Edda Marlow'] }),
            summary('hardcover:7', { title: 'Read One' }),
          ]
        : [
            summary('hardcover:8', {
              title: 'Newest',
              authors: ['Bram Inkwell'],
              publishedYear: 2026,
            }),
          ],
    );
    const { rows } = await service().get(me.id);
    expect(titles(rows)).toEqual({ author: ['Newest', 'Newest', 'Newer', 'Older'] });
    expect(rows[0]!.items.map((i) => i.isNew)).toEqual([true, true, false, false]);
  });

  it('keeps going when one author lookup fails, but not when every lookup fails', async () => {
    shelves.set(me.id, {
      readingData: true,
      books: [book(), book({ authors: ['Bram Inkwell'] })],
    });
    works.byAuthor.mockImplementation(async (_u: string, author: string) => {
      if (author === 'Bram Inkwell') throw unavailable();
      return [summary('hardcover:1', { title: 'Hers' })];
    });
    expect(titles((await service().get(me.id)).rows)).toEqual({ author: ['Hers'] });

    works.byAuthor.mockRejectedValue(unavailable());
    clock.advance(25 * 60 * 60 * 1000);
    const stale = await service().get(me.id);
    expect(stale.stale).toBe(true);
    expect(titles(stale.rows)).toEqual({ author: ['Hers'] });
    expect(log.warn).toHaveBeenCalled();
  });

  it('lets an unexpected error through', async () => {
    shelves.set(me.id, { readingData: true, books: [book()] });
    works.byAuthor.mockRejectedValue(new Error('bug'));
    await expect(service().get(me.id)).rejects.toThrow('bug');
  });
});

describe('RecommendService: partner shelves', () => {
  it('has a row per other reader, finished first by when, then newest owned', async () => {
    const two = await users.create({
      username: 'two',
      displayName: 'Reader Two',
      password: PASSWORD,
    });
    const three = await users.create({
      username: 'three',
      displayName: 'Reader Three',
      password: PASSWORD,
    });
    const shared = book({ finished: false });
    shelves.set(me.id, { readingData: false, books: [shared] });
    shelves.set(two.id, {
      readingData: true,
      books: [
        shared,
        book({ title: 'Unread Old', finished: false, ownedAt: new Date('2025-01-01') }),
        book({ title: 'Unread New', finished: false, ownedAt: new Date('2025-09-01') }),
        book({ title: 'Finished Early', at: '2025-02-01T00:00:00Z' }),
        book({ title: 'Finished Late', at: '2025-08-01T00:00:00Z' }),
        book({ title: 'German', languages: ['de'] }),
        book({
          title: 'No Language',
          languages: [],
          finished: false,
          ownedAt: new Date('2024-01-01'),
        }),
      ],
    });
    shelves.set(three.id, { readingData: false, books: [] });
    const titleOf = new Map(shelves.get(two.id)!.books.map((b) => [b.workId!, b.title]));
    works.getWork.mockImplementation(async (_u: string, id: string) => {
      // The providers can't find this one: the library's own data stands in.
      if (titleOf.get(id) === 'Unread Old') throw new AppError(404, 'NOT_FOUND', 'gone');
      return summary(id, { title: titleOf.get(id)! });
    });
    const result = await service().get(me.id);
    expect(result.readingData).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.partner).toEqual({ id: two.id, displayName: 'Reader Two' });
    expect(result.rows[0]!.items.map((i) => [i.work.title, i.reason])).toEqual(
      (
        [
          ['Finished Late', true],
          ['Finished Early', true],
          ['Unread New', false],
          ['Unread Old', false],
          ['No Language', false],
        ] as const
      ).map(([title, partnerFinished]) => [
        title,
        {
          kind: 'partner_shelf',
          partner: { id: two.id, displayName: 'Reader Two' },
          partnerFinished,
        },
      ]),
    );
    expect(result.rows[0]!.items[3]!.work.publishedYear).toBeNull();
    expect(works.getWork).toHaveBeenCalledTimes(5);
  });

  it('moves books by a down-ranked author to the end of other rows', async () => {
    const two = await users.create({
      username: 'two',
      displayName: 'Reader Two',
      password: PASSWORD,
    });
    shelves.set(two.id, {
      readingData: true,
      books: [
        book({ authors: ['Bram Inkwell'], at: '2025-09-01T00:00:00Z' }),
        book({ authors: ['Ada Quillfeather'], at: '2025-08-01T00:00:00Z' }),
      ],
    });
    works.getWork.mockImplementation(async (_u: string, id: string) =>
      summary(id, {
        authors: [Number(id.split(':')[1]) % 2 ? 'Ada Quillfeather' : 'Bram Inkwell'],
      }),
    );
    const svc = service();
    const before = (await svc.get(me.id)).rows[0]!.items.map((i) => i.work.authors[0]);
    works.workSummary.mockResolvedValue({ title: 'x', authors: [before[0]!] });
    await svc.dismiss(me.id, 'hardcover:1', 'author');
    const after = (await svc.get(me.id)).rows[0]!.items.map((i) => i.work.authors[0]);
    expect(after).toEqual([before[1], before[0]]);
  });
});

describe('RecommendService: users and dismissals', () => {
  it('needs a known user', async () => {
    const svc = service();
    await expect(svc.get('nobody')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(svc.dismiss('nobody', 'hardcover:1', 'book')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(() => svc.undoDismiss('nobody', 'hardcover:1')).toThrow(AppError);
  });

  it('renews an author dismissal instead of adding a second one', async () => {
    const svc = service();
    await svc.dismiss(me.id, 'hardcover:1', 'author');
    clock.advance(1000);
    const again = await svc.dismiss(me.id, 'hardcover:2', 'author');
    expect(again.expiresAt).toBe(new Date(clock.now.getTime() + 90 * 86_400_000).toISOString());
    expect(svc.undoDismiss(me.id, 'hardcover:1')).toEqual({ removed: 0 });
    expect(svc.undoDismiss(me.id, 'hardcover:2')).toEqual({ removed: 1 });
  });
});

describe('ReaderShelf without a library', () => {
  it('lists owned items by title only, without reading data', async () => {
    const items = new LibraryItems(database.db, clock.fn);
    const item = items.ensure({
      workId: 'hardcover:1',
      calibreBookId: 7,
      title: 'The Lighthouse Cat',
    });
    items.own(item.id, me.id);
    const linked = users.setCwaUserId('me', 3);
    const shelf = new ReaderShelf(items, null);
    expect(await shelf.books(linked)).toEqual({
      readingData: false,
      books: [
        expect.objectContaining({
          title: 'The Lighthouse Cat',
          authors: [],
          series: null,
          languages: [],
          reading: null,
        }),
      ],
    });
  });
});
