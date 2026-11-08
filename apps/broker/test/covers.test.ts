import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TokenPair } from '@purrshelf/contract';
import sharp from 'sharp';
import { fetchImage } from '../src/modules/covers/fetch-image.js';
import { colourFor, placeholderSvg, wrap } from '../src/modules/covers/placeholder.js';
import { noLibraryCovers } from '../src/modules/covers/library-covers.js';
import { CoverService } from '../src/modules/covers/service.js';
import { CoverStore } from '../src/modules/covers/store.js';
import type { DiscoverService } from '../src/modules/discover/service.js';
import type { FetchLike } from '../src/modules/discover/http.js';
import { login, makeTestApp, testConfig, type TestContext } from './helpers.js';
import { fakeProviders, json } from './metadata-fakes.js';

let jpeg: Buffer;
let pngLibrary: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 300, height: 450, channels: 3, background: '#335577' } })
    .jpeg()
    .toBuffer();
  pngLibrary = await sharp({
    create: { width: 200, height: 300, channels: 3, background: '#aa2222' },
  })
    .png()
    .toBuffer();
});

const image = (body: Buffer, type = 'image/jpeg') =>
  new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': type } });

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

type Overrides = Parameters<typeof fakeProviders>[0];

async function setup(
  opts: { images?: Record<string, () => Response>; overrides?: Overrides } & Parameters<
    typeof makeTestApp
  >[0] = {},
) {
  const fake = fakeProviders(opts.overrides);
  const images = opts.images ?? {};
  const fetch = vi.fn<FetchLike>(async (input, init) => {
    const handler = images[input];
    return handler ? handler() : fake.fetch(input, init);
  });
  ctx = await makeTestApp({ ...opts, config: { HARDCOVER_API_TOKEN: 'fake-token' }, fetch });
  const { accessToken } = TokenPair.parse((await login(ctx.app)).json());
  const cover = (id: string, size = 's', headers: Record<string, string> = {}) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1/covers/${encodeURIComponent(id)}?size=${size}`,
      headers: { authorization: `Bearer ${accessToken}`, ...headers },
    });
  const imageCalls = (url: string) => fetch.mock.calls.filter(([u]) => u === url).length;
  return { cover, imageCalls };
}

const HC_COVER = 'https://assets.hardcover.example.invalid/101.jpg';
const OL_COVER = 'https://covers.openlibrary.org/b/id/555-L.jpg';

describe('GET /covers/:id', () => {
  it('needs a login and a valid id and size', async () => {
    const { cover } = await setup();
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/v1/covers/hardcover:101' })).statusCode,
    ).toBe(401);
    expect((await cover('nope:1')).statusCode).toBe(400);
    expect((await cover('hardcover:101', 'xl')).statusCode).toBe(400);
  });

  it('downloads the best cover once and serves resized WebP with cache headers', async () => {
    const { cover, imageCalls } = await setup({ images: { [HC_COVER]: () => image(jpeg) } });
    const res = await cover('hardcover:101', 's');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toMatch(/max-age=2592000/);
    expect(res.headers['x-cover-kind']).toBe('remote');
    expect(await sharp(res.rawPayload).metadata()).toMatchObject({
      format: 'webp',
      width: 120,
      height: 180,
    });

    const large = await cover('hardcover:101', 'l');
    expect(await sharp(large.rawPayload).metadata()).toMatchObject({ width: 480, height: 720 });
    expect(imageCalls(HC_COVER)).toBe(1);
  });

  it('answers 304 when the ETag matches', async () => {
    const { cover } = await setup({ images: { [HC_COVER]: () => image(jpeg) } });
    const first = await cover('hardcover:101', 'm');
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^".+"$/);
    const again = await cover('hardcover:101', 'm', { 'if-none-match': etag });
    expect(again.statusCode).toBe(304);
    expect(again.rawPayload).toHaveLength(0);
  });

  it('falls back from Hardcover to Open Library when a cover fails', async () => {
    const { cover, imageCalls } = await setup({
      images: { [HC_COVER]: () => json({}, 404), [OL_COVER]: () => image(jpeg) },
    });
    // The search merges Hardcover, Open Library and Google Books records of this book.
    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/discover/search?q=havelaar',
      headers: {
        authorization: `Bearer ${TokenPair.parse((await login(ctx.app)).json()).accessToken}`,
      },
    });
    const res = await cover('hardcover:101');
    expect(res.headers['x-cover-kind']).toBe('remote');
    expect([imageCalls(HC_COVER), imageCalls(OL_COVER)]).toEqual([1, 1]);
  });

  it('uses the library cover for books in the library', async () => {
    const coverFor = vi.fn(async (id: string) =>
      id === 'hardcover:101' ? { key: 'calibre-7-1700000000', load: async () => pngLibrary } : null,
    );
    const { cover, imageCalls } = await setup({ libraryCovers: { coverFor } });
    const res = await cover('hardcover:101');
    expect(res.headers['x-cover-kind']).toBe('library');
    const { dominant } = await sharp(res.rawPayload).stats();
    expect(dominant.r).toBeGreaterThan(150);
    expect(imageCalls(HC_COVER)).toBe(0);
    await cover('hardcover:101');
    expect(coverFor).toHaveBeenCalledTimes(2);
  });

  it('falls back to a remote cover when the library cover is unreadable', async () => {
    const { cover } = await setup({
      images: { [HC_COVER]: () => image(jpeg) },
      libraryCovers: {
        coverFor: async () => ({ key: 'broken', load: async () => Buffer.from('not an image') }),
      },
    });
    expect((await cover('hardcover:101')).headers['x-cover-kind']).toBe('remote');
  });

  it('generates a placeholder card when no cover exists, and retries later', async () => {
    const { cover, imageCalls } = await setup({
      images: { [HC_COVER]: () => image(Buffer.from('tiny'), 'image/gif') },
    });
    const res = await cover('hardcover:101', 'm');
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-cover-kind']).toBe('placeholder');
    expect(res.headers['cache-control']).toMatch(/max-age=3600/);
    expect(await sharp(res.rawPayload).metadata()).toMatchObject({
      format: 'webp',
      width: 240,
      height: 360,
    });
    await cover('hardcover:101', 'm');
    expect(imageCalls(HC_COVER)).toBe(1);
    ctx.clock.advance(61 * 60 * 1000);
    // Access tokens expire after 15 minutes, so log in again.
    const { accessToken } = TokenPair.parse((await login(ctx.app)).json());
    await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/covers/hardcover:101?size=m',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(imageCalls(HC_COVER)).toBe(2);
  });

  it('gives a placeholder for a work without any cover URL, and when metadata is down', async () => {
    const { cover } = await setup({ overrides: { 'hardcover:Book': () => json({}, 500) } });
    // Google Books volume without imageLinks.
    expect((await cover('googlebooks:gbTulips22')).headers['x-cover-kind']).toBe('placeholder');
    expect((await cover('hardcover:5')).headers['x-cover-kind']).toBe('placeholder');
  });

  it('answers NOT_FOUND for an unknown work', async () => {
    const { cover } = await setup();
    expect((await cover('openlibrary:OL999W')).json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('cover for import', () => {
  function service(urls: string[], fetch: FetchLike) {
    const discover = {
      coverUrls: async () => urls,
      workSummary: async () => ({ title: 'T', authors: [] }),
    };
    return new CoverService({
      store: new CoverStore(testConfig().COVERS_PATH),
      discover: discover as unknown as DiscoverService,
      library: noLibraryCovers,
      http: { fetch, timeoutMs: 1000 },
      clock: () => new Date(),
      log: { warn: () => undefined },
    });
  }

  it('downloads the best metadata cover once and hands over the original bytes', async () => {
    const fetch = vi.fn<FetchLike>(async () => image(jpeg));
    const covers = service(['https://c.example.invalid/a.jpg'], fetch);
    expect(await covers.forImport('hardcover:1')).toEqual(jpeg);
    expect(await covers.forImport('hardcover:1')).toEqual(jpeg);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when no provider has a cover', async () => {
    expect(await service([], vi.fn()).forImport('hardcover:1')).toBeNull();
  });

  it('stores files in the store and reads them back', async () => {
    const store = new CoverStore(testConfig().COVERS_PATH);
    expect(await store.original('remote:x')).toBeNull();
    await store.write('remote:x', jpeg);
    expect(await store.original('remote:x')).toEqual(jpeg);
    expect(await store.read('remote:y', 's')).toBeNull();
  });
});

describe('fetchImage', () => {
  const http = (fetch: FetchLike) => ({ fetch, timeoutMs: 1000 });

  it.each([
    'http://covers.example.invalid/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://[::1]/a.jpg',
    'https://localhost/a.jpg',
    'https://nas/a.jpg',
    'not a url',
  ])('refuses %s without fetching', async (url) => {
    const fetch = vi.fn<FetchLike>();
    await expect(fetchImage(http(fetch), url)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a network error',
      async () => {
        throw new TypeError('offline');
      },
      'failed',
    ],
    ['a non-image', async () => json({}), 'not an image'],
    ['a missing type', async () => new Response(new Uint8Array(500)), 'no type'],
    [
      'a huge declared size',
      async () =>
        new Response('x', {
          headers: { 'content-type': 'image/jpeg', 'content-length': '99999999' },
        }),
      'too large',
    ],
  ])('rejects %s', async (_label, fetch, message) => {
    await expect(
      fetchImage(http(fetch as FetchLike), 'https://c.example.invalid/a.jpg'),
    ).rejects.toThrow(message);
  });
});

describe('placeholder card', () => {
  it('picks a stable colour from the design palette per book', () => {
    expect(colourFor('hardcover:1')).toBe(colourFor('hardcover:1'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(colourFor)).size).toBeGreaterThan(1);
  });

  it('wraps long titles and escapes markup', () => {
    expect(wrap('The Very Long Title Of A Book That Goes On', 10, 2)).toEqual([
      'The Very',
      'Long Titl…',
    ]);
    expect(wrap('Supercalifragilistic', 8, 2)).toEqual(['Superca…']);
    const svg = placeholderSvg('x', 'Salt & <Pepper>', 'A "B"');
    expect(svg).toContain('Salt &#38;');
    expect(svg).toContain('&#60;Pepper&#62;');
    expect(svg).toContain('A &#34;B&#34;');
    expect(placeholderSvg('x', '', null)).toContain('>?<');
  });
});
