import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Dismissal, DismissalsRemoved, Recommendations, TokenPair } from '@purrshelf/contract';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requests, users as usersTable } from '../../src/db/schema.js';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import { PASSWORD, login, makeTestApp, type TestContext } from '../helpers.js';
import { FakeCwa, READER_A, READER_B } from '../library/fake-cwa.js';
import { ISBN_SALT_ROAD, fakeProviders, json } from '../metadata-fakes.js';

/**
 * For you end to end (BRK-11): a fake CWA with two readers and the fake
 * metadata providers. Every book here is invented or public domain.
 */

const HOUR = 60 * 60 * 1000;
const METADATA_HOSTS = new Set(['api.hardcover.app', 'openlibrary.org', 'www.googleapis.com']);

let cwa: FakeCwa;
let adapter: CwaAdapter;
let ctx: TestContext;
let items: LibraryItems;
let me: string;
let partner: string;
let providers: ReturnType<typeof fakeProviders>;
let down: boolean;

const olDoc = (id: string, title: string, author: string, language: string, year: number) => ({
  key: `/works/${id}`,
  title,
  author_name: [author],
  language: [language],
  first_publish_year: year,
});

function makeProviders() {
  return fakeProviders({
    'openlibrary:search': (u) => {
      if (u.searchParams.get('author') === 'Ilse Varenkamp')
        return json({
          docs: [
            olDoc('OL901W', 'The Ember Tide', 'Ilse Varenkamp', 'eng', 2025),
            olDoc('OL902W', 'Het Zoutpad', 'Ilse Varenkamp', 'dut', 2024),
            olDoc('OL903W', 'Old Lanterns', 'Ilse Varenkamp', 'eng', 2001),
            olDoc('OL904W', 'Someone Else Entirely', 'Edda Marlow', 'eng', 2026),
          ],
        });
      return json({ docs: [] });
    },
  });
}

async function token(username = 'reader') {
  return TokenPair.parse((await login(ctx.app, username)).json()).accessToken;
}

async function call(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) {
  const res = await ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${await token()}` },
    ...(payload ? { payload } : {}),
  });
  return { status: res.statusCode, body: res.json() as unknown };
}

async function forYou() {
  const res = await call('GET', '/recommendations');
  expect(res.status).toBe(200);
  return Recommendations.parse(res.body);
}

const titles = (r: Recommendations) =>
  Object.fromEntries(r.rows.map((row) => [row.kind, row.items.map((i) => i.work.title)]));

function own(userId: string, workId: string | null, calibreBookId: number, title: string) {
  const item = items.ensure({ workId, calibreBookId, title });
  items.own(item.id, userId);
  return item;
}

beforeEach(async () => {
  down = false;
  cwa = new FakeCwa();
  cwa.addBook({
    id: 10,
    title: 'The Salt Road',
    authors: ['Ilse Varenkamp'],
    series: { name: 'Lantern Keepers', index: 1 },
    identifiers: [{ type: 'isbn', val: ISBN_SALT_ROAD }],
    languages: ['eng'],
  });
  cwa.addBook({
    id: 20,
    title: 'Pride and Prejudice',
    authors: ['Jane Austen'],
    languages: ['eng'],
  });
  cwa.addBook({ id: 21, title: 'Max Havelaar', authors: ['Multatuli'], languages: ['nld'] });
  cwa.addBook({ id: 22, title: 'Unmatched Book', authors: ['Nobody Known'] });
  cwa.app.exec(`
    insert into book_read_link (book_id, user_id, read_status, last_modified) values (10, 3, 1, '2025-12-01 10:00:00');
    insert into book_read_link (book_id, user_id, read_status, last_modified) values (21, 4, 1, '2025-11-01 10:00:00');
  `);
  adapter = cwa.adapter();
  providers = makeProviders();
  const fetch = providers.fetch;
  ctx = await makeTestApp({
    library: adapter,
    config: { HARDCOVER_API_TOKEN: 'fake-token' },
    fetch: async (input, init) => {
      if (down) throw new Error('offline');
      return fetch(input, init);
    },
  });
  await ctx.users.create({ username: 'partner', displayName: 'Reader Two', password: PASSWORD });
  me = ctx.users.findByUsername('reader')!.id;
  partner = ctx.users.findByUsername('partner')!.id;
  for (const [id, cwaUserId] of [
    [me, READER_A.cwaUserId],
    [partner, READER_B.cwaUserId],
  ] as const) {
    ctx.database.db.update(usersTable).set({ cwaUserId }).where(eq(usersTable.id, id)).run();
  }
  items = new LibraryItems(ctx.database.db, ctx.clock.fn);
  own(me, 'hardcover:301', 10, 'The Salt Road');
  own(partner, 'openlibrary:OL202W', 20, 'Pride and Prejudice');
  own(partner, 'hardcover:101', 21, 'Max Havelaar');
  own(partner, null, 22, 'Unmatched Book');
});

afterEach(async () => {
  await ctx.close();
  adapter.close();
  cwa.close();
});

describe('GET /recommendations', () => {
  it('needs a login', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/recommendations' });
    expect(res.statusCode).toBe(401);
  });

  it('suggests the next in my series, more by authors I finish and my partner’s books', async () => {
    const body = await forYou();
    expect(body).toMatchObject({ readingData: true, stale: false });
    expect(titles(body)).toEqual({
      next_in_series: ['The Glass Harbour'],
      // Newest first; the Dutch edition is left out for a reader who finishes English books.
      author: ['The Ember Tide', 'Old Lanterns'],
      // Max Havelaar is Dutch and the unmatched book has no page to open.
      partner_shelf: ['Pride and Prejudice'],
    });

    const [series, author, shelf] = body.rows;
    expect(series!.items[0]).toMatchObject({
      work: { id: 'hardcover:302', library: null },
      reason: {
        kind: 'next_in_series',
        series: { name: 'Lantern Keepers', position: 2 },
        after: { title: 'The Salt Road', position: 1, basis: 'finished' },
      },
      request: null,
    });
    expect(author!.items.map((i) => [i.isNew, i.reason])).toEqual([
      [
        true,
        {
          kind: 'author',
          author: 'Ilse Varenkamp',
          basis: 'finished',
          count: 1,
          title: 'The Salt Road',
        },
      ],
      [
        false,
        {
          kind: 'author',
          author: 'Ilse Varenkamp',
          basis: 'finished',
          count: 1,
          title: 'The Salt Road',
        },
      ],
    ]);
    expect(shelf).toMatchObject({
      kind: 'partner_shelf',
      partner: { id: partner, displayName: 'Reader Two' },
      items: [
        {
          reason: {
            kind: 'partner_shelf',
            partner: { id: partner, displayName: 'Reader Two' },
            partnerFinished: false,
          },
          work: { id: 'openlibrary:OL202W', library: { owners: [{ id: partner, me: false }] } },
        },
      ],
    });
  });

  it('shows the status of a book I already added', async () => {
    const now = ctx.clock.fn();
    ctx.database.db
      .insert(requests)
      .values({
        id: 'req-1',
        userId: me,
        workId: 'hardcover:302',
        queryJson: '{}',
        language: 'en',
        status: 'waiting_budget',
        searchStartedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const body = await forYou();
    expect(body.rows[0]!.items[0]!.request).toEqual({ id: 'req-1', status: 'waiting_budget' });
  });

  it('leaves out a partner book once I own it too', async () => {
    const item = items.byCalibreId(20)!;
    items.own(item.id, me);
    expect(titles(await forYou()).partner_shelf).toBeUndefined();
  });

  it('reuses the rows for 24 hours, then asks the providers again', async () => {
    await forYou();
    const asked = providers.fetch.mock.calls.length;
    ctx.clock.advance(23 * HOUR);
    await forYou();
    // Only the partner row is built fresh, from the 7-day metadata cache.
    expect(providers.fetch.mock.calls.length).toBe(asked);
    ctx.clock.advance(2 * HOUR);
    const later = await forYou();
    expect(later.computedAt).toBe(ctx.clock.fn().toISOString());
  });

  it('refreshes as soon as I finish another book', async () => {
    const first = await forYou();
    cwa.app.exec(`insert into book_read_link (book_id, user_id, read_status) values (20, 3, 1)`);
    items.own(items.byCalibreId(20)!.id, me);
    ctx.clock.advance(HOUR);
    const second = await forYou();
    expect(second.computedAt).not.toBe(first.computedAt);
  });

  it('serves the last rows marked stale when the providers are down', async () => {
    const first = await forYou();
    down = true;
    // Past the 7-day metadata cache too, so nothing can be looked up.
    ctx.clock.advance(8 * 24 * HOUR);
    const stale = await forYou();
    expect(stale).toMatchObject({ stale: true, computedAt: first.computedAt });
    expect(titles(stale)).toEqual(titles(first));
  });

  it('answers METADATA_UNAVAILABLE with nothing cached and nothing local to show', async () => {
    items.disown(items.byCalibreId(20)!.id, partner, HOUR);
    down = true;
    const res = await call('GET', '/recommendations');
    expect(res).toMatchObject({ status: 502, body: { code: 'METADATA_UNAVAILABLE' } });
  });

  it('still shows the partner row from library data when the providers are down', async () => {
    down = true;
    const body = await forYou();
    expect(body.stale).toBe(true);
    expect(titles(body)).toEqual({ partner_shelf: ['Pride and Prejudice'] });
    expect(body.rows[0]!.items[0]!.work).toMatchObject({
      id: 'openlibrary:OL202W',
      authors: ['Jane Austen'],
      language: 'en',
      sources: [{ provider: 'openlibrary', id: 'OL202W' }],
    });
  });

  it('uses owned books when my Kobo is not linked', async () => {
    ctx.database.db.update(usersTable).set({ cwaUserId: null }).where(eq(usersTable.id, me)).run();
    const body = await forYou();
    expect(body.readingData).toBe(false);
    // One owned book by the author is not enough without Kobo data; the series still counts.
    expect(titles(body)).toEqual({
      next_in_series: ['The Glass Harbour'],
      partner_shelf: ['Pride and Prejudice'],
    });
    expect(body.rows[0]!.items[0]!.reason).toMatchObject({ after: { basis: 'owned' } });
  });
});

describe('dismissing suggestions', () => {
  it('hides a book for good with Not for me, and Undo brings it back', async () => {
    const res = await call('POST', '/recommendations/openlibrary:OL901W/dismiss', {
      kind: 'book',
    });
    expect(res.status).toBe(200);
    expect(Dismissal.parse(res.body)).toEqual({
      workId: 'openlibrary:OL901W',
      kind: 'book',
      author: null,
      expiresAt: null,
    });
    expect(titles(await forYou()).author).toEqual(['Old Lanterns']);
    ctx.clock.advance(400 * 24 * HOUR);
    expect(titles(await forYou()).author).toEqual(['Old Lanterns']);

    const undo = await call('DELETE', '/recommendations/openlibrary:OL901W/dismiss');
    expect(DismissalsRemoved.parse(undo.body)).toEqual({ removed: 1 });
    expect(titles(await forYou()).author).toEqual(['The Ember Tide', 'Old Lanterns']);
    expect((await call('DELETE', '/recommendations/openlibrary:OL901W/dismiss')).body).toEqual({
      removed: 0,
    });
  });

  it('shows fewer by an author for 90 days', async () => {
    await forYou();
    const res = await call('POST', '/recommendations/openlibrary:OL901W/dismiss', {
      kind: 'author',
    });
    expect(Dismissal.parse(res.body)).toEqual({
      workId: 'openlibrary:OL901W',
      kind: 'author',
      author: 'Ilse Varenkamp',
      expiresAt: new Date(ctx.clock.now.getTime() + 90 * 24 * HOUR).toISOString(),
    });
    expect(titles(await forYou()).author).toBeUndefined();
    ctx.clock.advance(91 * 24 * HOUR);
    expect(titles(await forYou()).author).toEqual(['The Ember Tide', 'Old Lanterns']);
  });

  it('cannot show fewer by the author of a book without one', async () => {
    await forYou();
    const res = await call('POST', '/recommendations/hardcover:302/dismiss', { kind: 'author' });
    expect(res).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
  });

  it('hides a book by id when the providers are down, but needs them for an author', async () => {
    down = true;
    expect(
      (await call('POST', '/recommendations/openlibrary:OL999W/dismiss', { kind: 'book' })).status,
    ).toBe(200);
    expect(
      (await call('POST', '/recommendations/openlibrary:OL999W/dismiss', { kind: 'author' })).body,
    ).toMatchObject({ code: 'METADATA_UNAVAILABLE' });
  });

  it('validates the work id and the kind', async () => {
    expect((await call('POST', '/recommendations/nope/dismiss', { kind: 'book' })).status).toBe(
      400,
    );
    expect(
      (await call('POST', '/recommendations/hardcover:1/dismiss', { kind: 'everything' })).status,
    ).toBe(400);
  });
});

describe('zero indexer calls on For you', () => {
  it('only ever talks to metadata providers', async () => {
    await forYou();
    await call('POST', '/recommendations/openlibrary:OL901W/dismiss', { kind: 'author' });
    await call('DELETE', '/recommendations/openlibrary:OL901W/dismiss');
    ctx.clock.advance(25 * HOUR);
    await forYou();
    expect(providers.fetch).toHaveBeenCalled();
    const hosts = new Set(providers.fetch.mock.calls.map(([u]) => new URL(u).host));
    expect([...hosts].filter((h) => !METADATA_HOSTS.has(h))).toEqual([]);
  });

  it('has no code path from the recommend module to indexers, budget, search or downloads', () => {
    const dir = new URL('../../src/modules/recommend/', import.meta.url).pathname;
    const files = readdirSync(dir).map((f) => join(dir, f));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      expect([
        file,
        imports.filter((i) =>
          /indexer|budget|newznab|sabnzbd|releases|downloads|modules\/search|\.\.\/search|requests\//i.test(
            i,
          ),
        ),
      ]).toEqual([file, []]);
    }
  });
});
