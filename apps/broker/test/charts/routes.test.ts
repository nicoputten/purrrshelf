import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Charts, TokenPair, type LibraryState } from '@purrshelf/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LibraryLookup } from '../../src/modules/discover/library-lookup.js';
import { requests } from '../../src/db/schema.js';
import { APPLE_ATTEMPTS } from '../../src/modules/charts/apple.js';
import { login, makeTestApp, type TestContext } from '../helpers.js';
import {
  ISBN_HAVELAAR,
  ISBN_SALT_ROAD,
  fakeProviders,
  json,
  type Handler,
} from '../metadata-fakes.js';

/**
 * Top 10s end to end (BRK-12): fake Apple feeds and fake metadata providers.
 * Every book here is invented or public domain.
 */

const HOUR = 60 * 60 * 1000;
const METADATA_HOSTS = new Set([
  'api.hardcover.app',
  'openlibrary.org',
  'www.googleapis.com',
  'rss.marketingtools.apple.com',
]);

const appleResult = (name: string, artistName: string, genreIds: string[]) => ({
  id: name,
  name,
  artistName,
  kind: 'books',
  genres: [
    { genreId: '38', name: 'Books' },
    ...genreIds.map((genreId) => ({ genreId, name: 'x' })),
  ],
});

const feeds: Record<string, object> = {
  nl: {
    feed: {
      results: [
        appleResult('Max Havelaar', 'Multatuli', ['9031', '10049']),
        appleResult('Het Onbekende Boek', 'Iemand Anders & Nog Iemand', ['9032']),
        { name: '' },
      ],
    },
  },
  us: { feed: { results: [appleResult('The Salt Road', 'Ilse Varenkamp', ['9020'])] } },
};

let ctx: TestContext;
let providers: ReturnType<typeof fakeProviders>;
let appleDown: boolean;
let owned: Set<string>;

const library: LibraryLookup = {
  match: async (_userId, candidates) =>
    new Map(
      candidates
        .filter((c) => owned.has(c.key))
        .map((c): [string, LibraryState] => [
          c.key,
          {
            itemId: `item-${c.key}`,
            owners: [{ id: 'me', displayName: 'Reader One', me: true }],
            onMyKobo: false,
            reading: null,
          },
        ]),
    ),
};

const makeRoutes: Record<string, Handler> = {
  'apple:chart': (u) => {
    if (appleDown) return json({}, 503);
    return json(feeds[u.pathname.split('/')[3]!]!);
  },
  'hardcover:Trending': () =>
    json({ data: { books_trending: { ids: [301, 101, 999], error: null } } }),
  'hardcover:Books': () =>
    json({
      data: {
        books: [
          {
            id: 101,
            title: 'Max Havelaar',
            cached_contributors: [{ author: { name: 'Multatuli' } }],
            cached_tags: { Genre: [{ tag: 'Classics' }] },
            editions: [{ isbn_13: ISBN_HAVELAAR, language: { code2: 'nl' } }],
          },
          {
            id: 301,
            title: 'The Salt Road',
            cached_contributors: [{ author: { name: 'Ilse Varenkamp' } }],
            cached_tags: { Genre: [{ tag: 'Fantasy' }] },
            editions: [{ isbn_13: ISBN_SALT_ROAD, language: { code2: 'en' } }],
          },
          { title: 'no id' },
        ],
      },
    }),
  'openlibrary:search': () => json({ docs: [] }),
  'googlebooks:search': () => json({ items: [] }),
};

const makeProviders = () => fakeProviders(makeRoutes);

async function getCharts(config?: { status?: number }) {
  const access = TokenPair.parse((await login(ctx.app)).json()).accessToken;
  const res = await ctx.app.inject({
    method: 'GET',
    url: '/api/v1/charts',
    headers: { authorization: `Bearer ${access}` },
  });
  expect(res.statusCode).toBe(config?.status ?? 200);
  return res.statusCode === 200 ? Charts.parse(res.json()) : (res.json() as { code: string });
}

const list = (c: Charts, source: string, region: string | null, genre: string) =>
  c.charts.find((x) => x.source === source && x.region === region && x.genre === genre);

beforeEach(async () => {
  appleDown = false;
  owned = new Set();
  providers = makeProviders();
  ctx = await makeTestApp({
    config: { HARDCOVER_API_TOKEN: 'fake-token' },
    fetch: providers.fetch,
    libraryLookup: library,
  });
});

afterEach(async () => {
  await ctx.close();
});

describe('GET /charts', () => {
  it('answers Apple charts for both countries (mine first) and Hardcover trending, by genre', async () => {
    owned.add('hardcover:101');
    const charts = (await getCharts()) as Charts;
    expect(charts.stale).toBe(false);
    // No CWA library in this app: no Kobo reading data, so no top genre.
    expect(charts.topGenre).toBeNull();
    expect(charts.charts.map((c) => `${c.source}:${c.region}:${c.genre}`)).toEqual([
      'apple:nl:all',
      'apple:nl:thriller',
      'apple:nl:literary',
      'apple:us:all',
      'apple:us:fantasy_scifi',
      'hardcover:null:all',
      'hardcover:null:literary',
      'hardcover:null:fantasy_scifi',
    ]);
    const nl = list(charts, 'apple', 'nl', 'all')!;
    expect(nl.items.map((i) => [i.rank, i.title, i.authors, i.work?.id ?? null])).toEqual([
      [1, 'Max Havelaar', ['Multatuli'], 'hardcover:101'],
      // No provider knows it: the app searches for it by title and author.
      [2, 'Het Onbekende Boek', ['Iemand Anders', 'Nog Iemand'], null],
    ]);
    expect(nl.items[0]!.work!.library?.owners[0]?.me).toBe(true);
    expect(list(charts, 'apple', 'nl', 'thriller')!.items[0]!.rank).toBe(1);
    expect(list(charts, 'apple', 'us', 'fantasy_scifi')!.items[0]!.work?.id).toBe('hardcover:301');
    expect(list(charts, 'hardcover', null, 'all')!.items.map((i) => i.work?.id)).toEqual([
      'hardcover:301',
      'hardcover:101',
    ]);
  });

  it('shows my open request on a chart book', async () => {
    const userId = ctx.users.findByUsername('reader')!.id;
    ctx.database.db
      .insert(requests)
      .values({
        id: 'req-1',
        userId,
        workId: 'hardcover:301',
        queryJson: '{}',
        language: 'en',
        status: 'waiting_budget',
        searchStartedAt: ctx.clock.fn(),
        createdAt: ctx.clock.fn(),
        updatedAt: ctx.clock.fn(),
      })
      .run();
    const charts = (await getCharts()) as Charts;
    expect(list(charts, 'hardcover', null, 'all')!.items[0]!.request).toEqual({
      id: 'req-1',
      status: 'waiting_budget',
    });
    expect(list(charts, 'apple', 'nl', 'all')!.items[1]!.request).toBeNull();
  });

  it('fetches each chart once a day and keeps the last good one when a source is down', async () => {
    await getCharts();
    const appleCalls = providers.calls('apple:chart');
    const trendingCalls = providers.calls('hardcover:Trending');
    await getCharts();
    expect(providers.calls('apple:chart')).toBe(appleCalls);
    expect(providers.calls('hardcover:Trending')).toBe(trendingCalls);

    ctx.clock.advance(25 * HOUR);
    appleDown = true;
    const charts = (await getCharts()) as Charts;
    expect(providers.calls('apple:chart')).toBe(appleCalls + 2 * APPLE_ATTEMPTS);
    expect(charts.stale).toBe(true);
    expect(list(charts, 'apple', 'nl', 'all')!.items).toHaveLength(2);
  });

  it('answers METADATA_UNAVAILABLE when no chart could be fetched yet', async () => {
    appleDown = true;
    await ctx.close();
    providers = fakeProviders({
      'apple:chart': () => json({}, 503),
    });
    ctx = await makeTestApp({ fetch: providers.fetch, libraryLookup: library });
    expect(await getCharts({ status: 502 })).toMatchObject({ code: 'METADATA_UNAVAILABLE' });
  });

  it('leaves out Hardcover trending when Hardcover fails', async () => {
    await ctx.close();
    providers = fakeProviders({
      ...Object.fromEntries(
        ['apple:chart', 'openlibrary:search', 'googlebooks:search'].map((k) => [k, makeRoutes[k]!]),
      ),
      'hardcover:Trending': () => json({}, 500),
    });
    ctx = await makeTestApp({
      config: { HARDCOVER_API_TOKEN: 'fake-token' },
      fetch: providers.fetch,
      libraryLookup: library,
    });
    const charts = (await getCharts()) as Charts;
    expect(charts.charts.some((c) => c.source === 'hardcover')).toBe(false);
    expect(charts.stale).toBe(false);
  });

  it('needs a login', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/charts' });
    expect(res.statusCode).toBe(401);
  });
});

describe('zero indexer calls on top 10s', () => {
  it('only ever talks to Apple and the metadata providers', async () => {
    await getCharts();
    ctx.clock.advance(25 * HOUR);
    await getCharts();
    const hosts = new Set(providers.fetch.mock.calls.map(([u]) => new URL(u).host));
    expect([...hosts].filter((h) => !METADATA_HOSTS.has(h))).toEqual([]);
  });

  it('has no code path from the charts module to indexers, budget, search or downloads', () => {
    const dir = new URL('../../src/modules/charts/', import.meta.url).pathname;
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
