import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscoverSearchResult, TokenPair, WorkDetail, WorkSeries } from '@purrshelf/contract';
import type { LibraryLookup } from '../src/modules/discover/library-lookup.js';
import { fakeJwt, fakeProviders, ISBN_HAVELAAR, json } from './metadata-fakes.js';
import { login, makeTestApp, type TestContext } from './helpers.js';

const DAY = 24 * 60 * 60 * 1000;
let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

async function setup(
  opts: Parameters<typeof makeTestApp>[0] & { fake?: ReturnType<typeof fakeProviders> } = {},
) {
  const fake = opts.fake ?? fakeProviders();
  ctx = await makeTestApp({
    ...opts,
    config: { HARDCOVER_API_TOKEN: 'fake-token', ...opts.config },
    fetch: fake.fetch,
  });
  let { accessToken } = TokenPair.parse((await login(ctx.app)).json());
  /** Access tokens live 15 minutes; tests that move the clock log in again. */
  const relogin = async () => {
    ({ accessToken } = TokenPair.parse((await login(ctx.app)).json()));
  };
  const get = (url: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
  return { ...fake, get, relogin };
}

describe('GET /discover/search', () => {
  it('needs a login', async () => {
    await setup();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/discover/search?q=x' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a missing or empty query', async () => {
    const { get } = await setup();
    expect((await get('/discover/search')).json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await get('/discover/search?q=%20')).statusCode).toBe(400);
    expect((await get('/discover/search?q=x&language=de')).statusCode).toBe(400);
  });

  it('asks all three providers and merges by ISBN, then by title + author', async () => {
    const { get, calls } = await setup();
    const res = await get('/discover/search?q=havelaar&author=multatuli');
    expect(res.statusCode).toBe(200);
    const body = DiscoverSearchResult.parse(res.json());
    expect(body.providers).toEqual([
      { provider: 'hardcover', status: 'ok' },
      { provider: 'openlibrary', status: 'ok' },
      { provider: 'googlebooks', status: 'ok' },
    ]);
    expect(body.hits.map((h) => h.id)).toEqual([
      'hardcover:101',
      'hardcover:301',
      'openlibrary:OL202W',
      'googlebooks:gbTulips22',
    ]);
    const havelaar = body.hits[0]!;
    expect(havelaar.sources.map((s) => s.provider)).toEqual([
      'hardcover',
      'openlibrary',
      'googlebooks',
    ]);
    expect(havelaar).toMatchObject({ language: 'nl', hasCover: true, library: null });
    expect(havelaar.isbns).toEqual([ISBN_HAVELAAR, '9780000000057']);
    expect(body.hits[1]!.series).toMatchObject({ name: 'Lantern Keepers', position: 1 });
    expect([
      calls('hardcover:Search'),
      calls('openlibrary:search'),
      calls('googlebooks:search'),
    ]).toEqual([1, 1, 1]);
  });

  it('drops hits in another language when a language is picked', async () => {
    const { get } = await setup();
    const body = DiscoverSearchResult.parse(
      (await get('/discover/search?q=havelaar&language=nl')).json(),
    );
    // Pride and Prejudice is English; The Salt Road has no known language and stays.
    expect(body.hits.map((h) => h.title)).toEqual([
      'Max Havelaar',
      'The Salt Road',
      'Tulpen in de Sneeuw',
    ]);
  });

  it('caches provider replies for 7 days', async () => {
    const { get, calls, relogin } = await setup();
    await get('/discover/search?q=Havelaar');
    await get('/discover/search?q=%20havelaar%20');
    expect(calls('openlibrary:search')).toBe(1);
    ctx.clock.advance(7 * DAY - 1000);
    await relogin();
    await get('/discover/search?q=havelaar');
    expect(calls('openlibrary:search')).toBe(1);
    ctx.clock.advance(2000);
    expect((await get('/discover/search?q=havelaar')).statusCode).toBe(200);
    expect(calls('openlibrary:search')).toBe(2);
  });

  it('skips Hardcover without a token', async () => {
    const { get, calls } = await setup({ config: { HARDCOVER_API_TOKEN: '' } });
    const body = DiscoverSearchResult.parse((await get('/discover/search?q=havelaar')).json());
    expect(body.providers[0]).toEqual({ provider: 'hardcover', status: 'skipped' });
    expect(body.hits[0]!.id).toBe('openlibrary:OL101W');
    expect(calls('hardcover:Search')).toBe(0);
  });

  it('answers with what it has when one provider fails, and does not cache the failure', async () => {
    let down = true;
    const fake = fakeProviders({
      'hardcover:Search': () =>
        down ? json({}, 503) : json({ data: { search: { results: { hits: [] } } } }),
    });
    const { get, calls } = await setup({ fake });
    const body = DiscoverSearchResult.parse((await get('/discover/search?q=havelaar')).json());
    expect(body.providers[0]).toEqual({ provider: 'hardcover', status: 'failed' });
    expect(body.hits[0]!.id).toBe('openlibrary:OL101W');
    down = false;
    await get('/discover/search?q=havelaar');
    expect(calls('hardcover:Search')).toBe(2);
  });

  it('answers METADATA_UNAVAILABLE when every provider fails', async () => {
    const fail = () => json({}, 500);
    const fake = fakeProviders({
      'hardcover:Search': fail,
      'openlibrary:search': fail,
      'googlebooks:search': fail,
    });
    const { get } = await setup({ fake });
    const res = await get('/discover/search?q=havelaar');
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'METADATA_UNAVAILABLE' });
  });

  it('says which hits are in the library and who owns them', async () => {
    const lookup: LibraryLookup = {
      match: vi.fn<LibraryLookup['match']>(
        async (_userId, candidates) =>
          new Map(
            candidates
              .filter((c) => c.isbns.includes(ISBN_HAVELAAR))
              .map((c) => [
                c.key,
                {
                  itemId: 'item-1',
                  owners: [{ id: 'u2', displayName: 'Reader Two', me: false }],
                  onMyKobo: false,
                },
              ]),
          ),
      ),
    };
    const { get } = await setup({ libraryLookup: lookup });
    const body = DiscoverSearchResult.parse((await get('/discover/search?q=havelaar')).json());
    expect(body.hits[0]!.library).toEqual({
      itemId: 'item-1',
      owners: [{ id: 'u2', displayName: 'Reader Two', me: false }],
      onMyKobo: false,
    });
    expect(body.hits[1]!.library).toBeNull();
    const userId = ctx.users.findByUsername('reader')!.id;
    expect(vi.mocked(lookup.match).mock.calls[0]![0]).toBe(userId);
  });
});

describe('GET /works/:id', () => {
  it('returns details filled in from the search hit', async () => {
    const { get } = await setup();
    await get('/discover/search?q=pride');
    const res = await get('/works/openlibrary:OL202W');
    expect(res.statusCode).toBe(200);
    const work = WorkDetail.parse(res.json());
    expect(work).toMatchObject({
      id: 'openlibrary:OL202W',
      title: 'Pride and Prejudice',
      authors: ['Jane Austen'],
      // From the search hit; the work reply has no language.
      language: 'en',
      description: 'Five sisters and one very proud man.',
      subjects: ['Courtship', 'England'],
      library: null,
    });
  });

  it('works without a prior search and caches the reply', async () => {
    const { get, calls } = await setup();
    const work = WorkDetail.parse((await get('/works/hardcover:101')).json());
    expect(work).toMatchObject({
      language: 'nl',
      pageCount: 352,
      sources: [{ provider: 'hardcover', id: '101' }],
    });
    await get('/works/hardcover:101');
    expect(calls('hardcover:Book')).toBe(1);
  });

  it('answers NOT_FOUND for an unknown work and VALIDATION_ERROR for a bad id', async () => {
    const { get } = await setup();
    expect((await get('/works/openlibrary:OL999W')).json()).toMatchObject({ code: 'NOT_FOUND' });
    expect((await get('/works/amazon:B000')).statusCode).toBe(400);
  });

  it('falls back to the search hit when the provider is down, else METADATA_UNAVAILABLE', async () => {
    const fake = fakeProviders({
      'googlebooks:volume': () => json({}, 500),
      'hardcover:Book': () => json({}, 500),
    });
    const { get } = await setup({ fake });
    await get('/discover/search?q=tulpen');
    const res = await get('/works/googlebooks:gbTulips22');
    expect(res.statusCode).toBe(200);
    expect(WorkDetail.parse(res.json()).description).toContain('winter');
    const down = await get('/works/hardcover:5');
    expect(down.statusCode).toBe(502);
    expect(down.json()).toMatchObject({ code: 'METADATA_UNAVAILABLE' });
  });

  it('answers NOT_FOUND for a provider that is not configured', async () => {
    const { get, calls } = await setup({ config: { HARDCOVER_API_TOKEN: '' } });
    expect((await get('/works/hardcover:101')).json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(calls('hardcover:Book')).toBe(0);
  });
});

describe('GET /works/:id/series', () => {
  it('lists the Hardcover series in reading order', async () => {
    const { get } = await setup();
    const res = await get('/works/hardcover:301/series');
    expect(res.statusCode).toBe(200);
    const body = WorkSeries.parse(res.json());
    expect(body.series).toEqual({ id: 'hardcover:77', name: 'Lantern Keepers', total: 3 });
    expect(body.entries.map((e) => [e.position, e.work.id])).toEqual([
      [1, 'hardcover:301'],
      [2, 'hardcover:302'],
    ]);
    expect(body.entries[1]!.work.hasCover).toBe(true);
  });

  it('returns no series for a stand-alone book', async () => {
    const { get } = await setup();
    expect((await get('/works/hardcover:101/series')).json()).toEqual({
      series: null,
      entries: [],
    });
  });

  it('falls back to the book itself when the series cannot be read', async () => {
    const fake = fakeProviders({ 'hardcover:Series': () => json({}, 500) });
    const { get } = await setup({ fake });
    const body = WorkSeries.parse((await get('/works/hardcover:301/series')).json());
    expect(body.series?.name).toBe('Lantern Keepers');
    expect(body.entries.map((e) => [e.position, e.work.id])).toEqual([[1, 'hardcover:301']]);
  });
});

describe('zero indexer calls on discover endpoints', () => {
  const METADATA_HOSTS = new Set(['api.hardcover.app', 'openlibrary.org', 'www.googleapis.com']);

  it('only ever talks to metadata providers', async () => {
    const { get, fetch } = await setup();
    for (const url of [
      '/discover/search?q=havelaar',
      '/discover/search?q=havelaar&language=en',
      '/works/hardcover:101',
      '/works/openlibrary:OL202W',
      '/works/googlebooks:gbTulips22',
      '/works/hardcover:301/series',
      '/works/hardcover:301/similar',
      '/works/hardcover:101/similar',
    ]) {
      expect((await get(url)).statusCode).toBe(200);
    }
    const hosts = new Set(fetch.mock.calls.map(([u]) => new URL(u).host));
    expect([...hosts].filter((h) => !METADATA_HOSTS.has(h))).toEqual([]);
  });

  it('has no code path from the discover module to indexers, budget or downloads', () => {
    const dir = new URL('../src/modules/discover/', import.meta.url).pathname;
    const files = (function walk(d: string): string[] {
      return readdirSync(d).flatMap((f) => {
        const p = join(d, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    })(dir);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      expect([
        file,
        imports.filter((i) => /indexer|budget|newznab|sabnzbd|request/i.test(i)),
      ]).toEqual([file, []]);
    }
  });
});

describe('Hardcover token expiry', () => {
  it('turns /health degraded 30 days before the token expires', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    ctx = await makeTestApp({
      config: { HARDCOVER_API_TOKEN: `Bearer ${fakeJwt(new Date(now.getTime() + 40 * DAY))}` },
    });
    const health = async () =>
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/health' })).json();
    expect((await health()).status).toBe('ok');
    ctx.clock.advance(11 * DAY);
    const degraded = await health();
    expect(degraded.status).toBe('degraded');
    expect(degraded.checks).toContainEqual({
      name: 'hardcover-token',
      status: 'fail',
      error: expect.stringContaining('expires on 2026-02-10 (29 days)'),
    });
    ctx.clock.advance(30 * DAY);
    expect((await health()).checks.at(-1).error).toContain('expired on 2026-02-10');
  });

  it('logs a warning at startup when the token is close to expiry', async () => {
    ctx = await makeTestApp({
      config: { HARDCOVER_API_TOKEN: fakeJwt(new Date('2026-01-05T00:00:00Z')) },
    });
    const warn = vi.spyOn(ctx.app.log, 'warn');
    await ctx.app.ready();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Hardcover token expires'));
  });
});
