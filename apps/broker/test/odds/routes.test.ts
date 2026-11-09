import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestPreview, TokenPair, type LibraryState } from '@purrshelf/contract';
import { afterEach, describe, expect, it } from 'vitest';
import { requests } from '../../src/db/schema.js';
import type { LibraryLookup } from '../../src/modules/discover/library-lookup.js';
import { PASSWORD, login, makeTestApp, type TestContext } from '../helpers.js';
import { fakeProviders, hardcover, json } from '../metadata-fakes.js';

/**
 * GET /requests/preview (BRK-13) end to end with the fake metadata
 * providers. Every book here is invented; the clock starts 2026-01-01.
 */

const DAY = 24 * 60 * 60 * 1000;
const METADATA_HOSTS = new Set(['api.hardcover.app', 'openlibrary.org', 'www.googleapis.com']);

/** Invented Hardcover books with the new facts. */
const books: Record<number, object> = {
  // A well-read English book with an ISBN, out for years.
  501: {
    id: 501,
    title: 'The Copper Orchard',
    release_date: '2015-04-12',
    release_year: 2015,
    users_count: 1200,
    cached_contributors: [{ author: { name: 'Edda Marlow' } }],
    editions: [{ isbn_13: '9780000000033', language: { code2: 'en' } }],
  },
  // Out on the clock's own day.
  502: {
    id: 502,
    title: 'Fresh Ink',
    release_date: '2026-01-01',
    users_count: 40,
    cached_contributors: [{ author: { name: 'Edda Marlow' } }],
    editions: [{ isbn_13: '9780000000040', language: { code2: 'en' } }],
  },
  // Few readers.
  503: {
    id: 503,
    title: 'Quiet Moths',
    release_date: '2012-06-01',
    users_count: 3,
    cached_contributors: [{ author: { name: 'Edda Marlow' } }],
    editions: [{ isbn_13: '9780000000057', language: { code2: 'en' } }],
  },
};

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

async function setup(opts: { libraryLookup?: LibraryLookup } = {}) {
  const fake = fakeProviders({
    'hardcover:Book': (_u, init) => {
      const { variables } = JSON.parse(String(init?.body)) as { variables: { id: number } };
      if (variables.id === 101) return json(hardcover.book101);
      if (variables.id === 301) return json(hardcover.book301);
      const book = books[variables.id];
      return json(book ? { data: { books: [book] } } : hardcover.empty);
    },
  });
  ctx = await makeTestApp({
    config: { HARDCOVER_API_TOKEN: 'fake-token' },
    fetch: fake.fetch,
    ...opts,
  });
  const { accessToken } = TokenPair.parse((await login(ctx.app)).json());
  const get = (url: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  const preview = async (workId: string, language = 'en') => {
    const res = await get(`/requests/preview?workId=${workId}&language=${language}`);
    expect(res.statusCode).toBe(200);
    return RequestPreview.parse(res.json());
  };
  return { ...fake, get, preview };
}

function insertRequest(
  userId: string,
  workId: string,
  status: 'not_found' | 'searching',
  at: Date,
) {
  ctx.database.db
    .insert(requests)
    .values({
      id: `req-${Math.random().toString(36).slice(2)}`,
      userId,
      workId,
      queryJson: '{}',
      language: 'en',
      status,
      searchStartedAt: at,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

async function otherReader(): Promise<string> {
  const user = await ctx.users.create({
    username: 'partner',
    displayName: 'Reader Two',
    password: PASSWORD,
    locale: 'en',
  });
  return user.id;
}

describe('GET /requests/preview', () => {
  it('needs a login', async () => {
    await setup();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/requests/preview?workId=hardcover:501&language=en',
    });
    expect(res.statusCode).toBe(401);
  });

  it('validates the query', async () => {
    const { get } = await setup();
    expect((await get('/requests/preview?language=en')).json()).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect((await get('/requests/preview?workId=hardcover:501&language=de')).statusCode).toBe(400);
    expect((await get('/requests/preview?workId=nope&language=en')).statusCode).toBe(400);
  });

  it('is not taken for a request id', async () => {
    const { get } = await setup();
    const res = await get('/requests/preview?workId=hardcover:501&language=en');
    expect(res.json()).toEqual({ workId: 'hardcover:501', language: 'en', lowOdds: null });
  });

  it('answers 404 for an unknown book', async () => {
    const { get } = await setup();
    const res = await get('/requests/preview?workId=hardcover:999&language=en');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('sends one reason per book, from the metadata', async () => {
    const { preview } = await setup();
    expect((await preview('hardcover:502')).lowOdds).toMatchObject({
      code: 'LOW_ODDS_NEW',
      releaseDate: '2026-01-01',
    });
    expect((await preview('hardcover:503')).lowOdds).toMatchObject({
      code: 'LOW_ODDS_RARE',
      readers: 3,
    });
    // Google Books knows this one, but without an ISBN.
    expect((await preview('googlebooks:gbTulips22')).lowOdds).toMatchObject({
      code: 'LOW_ODDS_NO_MATCH',
    });
  });

  it('warns about Dutch, naming the English edition only when there is one', async () => {
    const { preview } = await setup();
    expect(await preview('hardcover:301', 'nl')).toEqual({
      workId: 'hardcover:301',
      language: 'nl',
      lowOdds: {
        code: 'LOW_ODDS_LANGUAGE',
        notFoundAt: null,
        releaseDate: null,
        englishEditionWorkId: 'hardcover:301',
        readers: null,
      },
    });
    expect((await preview('hardcover:101', 'nl')).lowOdds).toMatchObject({
      code: 'LOW_ODDS_LANGUAGE',
      englishEditionWorkId: null,
    });
    expect((await preview('hardcover:301', 'en')).lowOdds).toBeNull();
  });

  it('counts any reader\'s "not found" from the last 30 days, not older ones', async () => {
    const { preview } = await setup();
    const partner = await otherReader();
    const start = ctx.clock.now;
    insertRequest(partner, 'hardcover:501', 'not_found', new Date(start.getTime() - 40 * DAY));
    insertRequest(partner, 'hardcover:501', 'searching', start);
    expect((await preview('hardcover:501')).lowOdds).toBeNull();

    const recent = new Date(start.getTime() - 3 * DAY);
    insertRequest(partner, 'hardcover:501', 'not_found', recent);
    expect((await preview('hardcover:501')).lowOdds).toEqual({
      code: 'LOW_ODDS_NOT_FOUND',
      notFoundAt: recent.toISOString(),
      releaseDate: null,
      englishEditionWorkId: null,
      readers: null,
    });
    // Another work's "not found" does not count.
    expect((await preview('hardcover:503')).lowOdds?.code).toBe('LOW_ODDS_RARE');
  });

  it('gives no warning for a book the library already has', async () => {
    const state: LibraryState = { itemId: 'item-1', owners: [], onMyKobo: false, reading: null };
    const { preview } = await setup({
      libraryLookup: {
        match: async (_userId, candidates) =>
          new Map(candidates.filter((c) => c.key === 'hardcover:502').map((c) => [c.key, state])),
      },
    });
    expect((await preview('hardcover:502')).lowOdds).toBeNull();
    expect((await preview('hardcover:503')).lowOdds?.code).toBe('LOW_ODDS_RARE');
  });
});

describe('zero indexer calls on the request preview', () => {
  it('only ever talks to metadata providers', async () => {
    const { preview, fetch } = await setup();
    for (const id of [
      'hardcover:101',
      'hardcover:301',
      'hardcover:502',
      'googlebooks:gbTulips22',
    ]) {
      await preview(id, 'en');
      await preview(id, 'nl');
    }
    expect(fetch).toHaveBeenCalled();
    const hosts = new Set(fetch.mock.calls.map(([u]) => new URL(u).host));
    expect([...hosts].filter((h) => !METADATA_HOSTS.has(h))).toEqual([]);
  });

  it('has no code path from the odds module to indexers, budget, search or downloads', () => {
    const dir = new URL('../../src/modules/odds/', import.meta.url).pathname;
    const files = readdirSync(dir).map((f) => join(dir, f));
    expect(files.length).toBeGreaterThanOrEqual(5);
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
