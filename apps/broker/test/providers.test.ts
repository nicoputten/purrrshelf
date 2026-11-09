import { describe, expect, it, vi } from 'vitest';
import {
  ProviderError,
  requestJson,
  USER_AGENT,
  type FetchLike,
} from '../src/modules/discover/http.js';
import { GoogleBooksProvider } from '../src/modules/discover/providers/googlebooks.js';
import { bareToken, HardcoverProvider } from '../src/modules/discover/providers/hardcover.js';
import { OpenLibraryProvider } from '../src/modules/discover/providers/openlibrary.js';
import { fakeProviders, hardcover, ISBN_HAVELAAR, json } from './metadata-fakes.js';

const http = (fetch: FetchLike) => ({ fetch, timeoutMs: 1000 });
const query = { title: 'havelaar', language: 'any' as const };

describe('requestJson', () => {
  it('sends a JSON body with a neutral user agent', async () => {
    const fetch = vi.fn<FetchLike>(async () => json({ ok: true }));
    await requestJson(http(fetch), 'https://x.example.invalid/a', {
      method: 'POST',
      body: { a: 1 },
    });
    const init = fetch.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['user-agent']).toBe(USER_AGENT);
    expect(headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('returns undefined for 404 and throws ProviderError for the rest', async () => {
    await expect(
      requestJson(
        http(async () => json({}, 404)),
        'https://x.example.invalid',
      ),
    ).resolves.toBeUndefined();
    await expect(
      requestJson(
        http(async () => json({}, 503)),
        'https://x.example.invalid',
      ),
    ).rejects.toThrow(ProviderError);
    await expect(
      requestJson(
        http(async () => new Response('<html>')),
        'https://x.example.invalid',
      ),
    ).rejects.toThrow('not JSON');
    await expect(
      requestJson(
        http(async () => {
          throw new TypeError('offline');
        }),
        'https://x.example.invalid',
      ),
    ).rejects.toThrow('failed');
  });
});

describe('HardcoverProvider', () => {
  it('is only configured with a token, and accepts it with or without "Bearer "', async () => {
    expect(new HardcoverProvider(http(vi.fn()), undefined).configured).toBe(false);
    expect(bareToken(' Bearer abc ')).toBe('abc');
    const { fetch } = fakeProviders();
    await new HardcoverProvider(http(fetch), 'Bearer tok').search(query);
    expect((fetch.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe(
      'Bearer tok',
    );
  });

  it('normalises search hits and drops unusable ones', async () => {
    const { fetch } = fakeProviders();
    const hits = await new HardcoverProvider(http(fetch), 'tok').search({
      ...query,
      author: 'multatuli',
    });
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).variables).toEqual({
      q: 'havelaar multatuli',
    });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      provider: 'hardcover',
      id: '101',
      subtitle: null,
      isbns: [ISBN_HAVELAAR],
    });
    expect(hits[1]!.series).toEqual({
      id: 'hardcover:77',
      name: 'Lantern Keepers',
      position: 1,
      total: 3,
    });
  });

  it('reads trending books in trending order, with genre tags', async () => {
    const { fetch } = fakeProviders({
      'hardcover:Trending': () =>
        json({ data: { books_trending: { ids: [301, 404, 101], error: null } } }),
      'hardcover:Books': () =>
        json({
          data: { books: [hardcover.book101.data.books[0], hardcover.book301.data.books[0], {}] },
        }),
    });
    const works = await new HardcoverProvider(http(fetch), 'tok').trending(3);
    expect(works.map((w) => [w.id, w.subjects])).toEqual([
      ['301', []],
      ['101', ['Classics', 'Satire']],
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1]![1]!.body)).variables).toEqual({
      ids: [301, 404, 101],
    });
  });

  it('answers no trending books without a second call, and fails on errors', async () => {
    const empty = fakeProviders({
      'hardcover:Trending': () => json({ data: { books_trending: { ids: [], error: null } } }),
    });
    expect(await new HardcoverProvider(http(empty.fetch), 'tok').trending(5)).toEqual([]);
    expect(empty.fetch).toHaveBeenCalledTimes(1);

    const replies = [{ data: { books_trending: { ids: null, error: 'too busy' } } }, { data: {} }];
    for (const reply of replies) {
      const { fetch } = fakeProviders({ 'hardcover:Trending': () => json(reply) });
      await expect(new HardcoverProvider(http(fetch), 'tok').trending(5)).rejects.toBeInstanceOf(
        ProviderError,
      );
    }
    const badBooks = fakeProviders({
      'hardcover:Trending': () => json({ data: { books_trending: { ids: [1] } } }),
      'hardcover:Books': () => json({ data: { nope: [] } }),
    });
    await expect(
      new HardcoverProvider(http(badBooks.fetch), 'tok').trending(5),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('reads a book with language, genres and series', async () => {
    const { fetch } = fakeProviders();
    const hc = new HardcoverProvider(http(fetch), 'tok');
    expect(await hc.getWork('101')).toMatchObject({
      authors: ['Multatuli'],
      language: 'nl',
      subjects: ['Classics', 'Satire'],
      pageCount: 352,
      description: expect.stringContaining('coffee'),
    });
    expect((await hc.getWork('301'))!.series).toMatchObject({
      name: 'Lantern Keepers',
      position: 1,
    });
    expect(await hc.getWork('999')).toBeNull();
    expect(await hc.getWork('abc')).toBeNull();
  });

  it('reads the release date, edition languages and readers (BRK-13)', async () => {
    const book = (over: object) =>
      new HardcoverProvider(
        http(async () =>
          json({
            data: {
              books: [
                {
                  id: 601,
                  title: 'Lamplight Ledger',
                  editions: [
                    { isbn_13: '9780000000064', language: { code2: 'nl' } },
                    { isbn_13: null, language: { code2: 'en' } },
                    { isbn_13: null, language: { code2: 'nl' } },
                    { isbn_13: null, language: null },
                  ],
                  ...over,
                },
              ],
            },
          }),
        ),
        'tok',
      ).getWork('601');
    expect(await book({ release_date: '2024-02-29', users_count: 7 })).toMatchObject({
      language: 'nl',
      languages: ['nl', 'en'],
      releaseDate: '2024-02-29',
      readers: 7,
    });
    expect(await book({ release_date: '2024-02-29T00:00:00+00:00' })).toMatchObject({
      releaseDate: '2024-02-29',
      readers: null,
    });
    for (const [release_date, users_count] of [
      ['2023-02-29', -1],
      ['2024', 2.5],
      [42, 'many'],
    ]) {
      expect(await book({ release_date, users_count })).toMatchObject({
        releaseDate: null,
        readers: null,
      });
    }
  });

  it('asks Hardcover for the release date and readers', async () => {
    const { fetch } = fakeProviders();
    expect(await new HardcoverProvider(http(fetch), 'tok').getWork('101')).toMatchObject({
      languages: ['nl'],
      releaseDate: null,
      readers: null,
    });
    const { query: gql } = JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as { query: string };
    expect(gql).toContain('release_date');
    expect(gql).toContain('users_count');
  });

  it('reads a series, one book per position, in order', async () => {
    const { fetch } = fakeProviders();
    const series = await new HardcoverProvider(http(fetch), 'tok').getSeries('77');
    expect(series).toMatchObject({ id: '77', name: 'Lantern Keepers', total: 3 });
    expect(series!.entries.map((e) => [e.position, e.work.title])).toEqual([
      [1, 'The Salt Road'],
      [2, 'The Glass Harbour'],
    ]);
    expect(series!.entries[1]!.work.series).toMatchObject({ id: 'hardcover:77', position: 2 });
  });

  it('returns null for an unknown series', async () => {
    const { fetch } = fakeProviders({ 'hardcover:Series': () => json({ data: { series: [] } }) });
    const hc = new HardcoverProvider(http(fetch), 'tok');
    expect(await hc.getSeries('5')).toBeNull();
    expect(await hc.getSeries('x')).toBeNull();
  });

  it.each([
    ['GraphQL errors', json({ errors: [{ message: 'field "x" not found' }] }), 'field "x"'],
    ['GraphQL errors without a message', json({ errors: [{}] }), 'GraphQL error'],
    ['an unknown shape', json({ data: { nope: 1 } }), 'unknown shape'],
    ['a 404', json({}, 404), '404'],
  ])('throws on %s', async (_label, response, message) => {
    const hc = new HardcoverProvider(
      http(async () => response.clone()),
      'tok',
    );
    await expect(hc.search(query)).rejects.toThrow(message);
  });

  it('throws on unknown book and series shapes', async () => {
    const hc = new HardcoverProvider(
      http(async () => json({ data: { other: [] } })),
      'tok',
    );
    await expect(hc.getWork('1')).rejects.toThrow('unknown shape');
    await expect(hc.getSeries('1')).rejects.toThrow('unknown shape');
  });

  it('copes with a search without results', async () => {
    const hc = new HardcoverProvider(
      http(async () => json({ data: { search: { results: null } } })),
      'tok',
    );
    await expect(hc.search(query)).resolves.toEqual([]);
  });
});

describe('OpenLibraryProvider', () => {
  it('searches by title, author and language and normalises the docs', async () => {
    const { fetch } = fakeProviders();
    const hits = await new OpenLibraryProvider(http(fetch)).search({
      title: 'havelaar',
      author: 'multatuli',
      language: 'en',
    });
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('title')).toBe('havelaar');
    expect(url.searchParams.get('author')).toBe('multatuli');
    expect(url.searchParams.get('language')).toBe('eng');
    expect(hits.map((h) => h.id)).toEqual(['OL101W', 'OL202W']);
    expect(hits[0]).toMatchObject({
      language: 'en',
      isbns: [ISBN_HAVELAAR],
      coverUrl: 'https://covers.openlibrary.org/b/id/555-L.jpg',
    });
    expect(hits[1]!.coverUrl).toBeNull();
  });

  it('searches free words (title, author or both) as a general query', async () => {
    const { fetch } = fakeProviders();
    await new OpenLibraryProvider(http(fetch)).search({
      text: 'multatuli havelaar',
      language: 'any',
    });
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('q')).toBe('multatuli havelaar');
    expect(url.searchParams.has('title')).toBe(false);
  });

  it('uses the first language when no language is asked for', async () => {
    const { fetch } = fakeProviders();
    const hits = await new OpenLibraryProvider(http(fetch)).search(query);
    expect(new URL(fetch.mock.calls[0]![0]).searchParams.has('language')).toBe(false);
    expect(hits[0]!.language).toBe('nl');
  });

  it('reads a work and its authors', async () => {
    const { fetch, calls } = fakeProviders();
    const ol = new OpenLibraryProvider(http(fetch));
    expect(await ol.getWork('OL202W')).toMatchObject({
      title: 'Pride and Prejudice',
      authors: ['Jane Austen'],
      description: 'Five sisters and one very proud man.',
      coverUrl: 'https://covers.openlibrary.org/b/id/777-L.jpg',
      publishedYear: 1813,
      subjects: ['Courtship', 'England'],
    });
    expect(calls('openlibrary:author')).toBe(1);
    expect(await ol.getWork('OL999W')).toBeNull();
    expect(await ol.getWork('../etc')).toBeNull();
  });

  it('reads plain-string descriptions and skips authors it cannot read', async () => {
    const { fetch } = fakeProviders({
      'openlibrary:work': () =>
        json({
          title: 'X',
          description: 'Plain.',
          authors: [{ author: { key: '/authors/OL1A' } }],
        }),
      'openlibrary:author': () => json({}),
    });
    expect(await new OpenLibraryProvider(http(fetch)).getWork('OL1W')).toMatchObject({
      description: 'Plain.',
      authors: [],
    });
  });

  it('throws on unknown shapes', async () => {
    const ol = new OpenLibraryProvider(http(async () => json({ nope: 1 })));
    await expect(ol.search(query)).rejects.toThrow('unknown shape');
    await expect(ol.getWork('OL1W')).rejects.toThrow('unknown shape');
  });
});

describe('GoogleBooksProvider', () => {
  it('searches with intitle/inauthor, a language and the key when set', async () => {
    const { fetch } = fakeProviders();
    const hits = await new GoogleBooksProvider(http(fetch), 'fake-key').search({
      title: 'havelaar',
      author: 'multatuli',
      language: 'nl',
    });
    const url = new URL(fetch.mock.calls[0]![0]);
    expect(url.searchParams.get('q')).toBe('intitle:havelaar inauthor:multatuli');
    expect(url.searchParams.get('langRestrict')).toBe('nl');
    expect(url.searchParams.get('key')).toBe('fake-key');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      id: 'gbHavelaar1',
      isbns: ['9780000000057'],
      language: 'nl',
      publishedYear: 1860,
      coverUrl: 'https://books.example.invalid/gb1?zoom=1',
    });
    expect(hits[1]).toMatchObject({
      description: 'Een roman over winter.\n\nDeel twee.',
      coverUrl: null,
      subjects: ['Fiction'],
      pageCount: 210,
    });
  });

  it('searches free words without intitle, so an author name can match', async () => {
    const { fetch } = fakeProviders();
    await new GoogleBooksProvider(http(fetch), undefined).search({
      text: 'multatuli havelaar',
      language: 'any',
    });
    expect(new URL(fetch.mock.calls[0]![0]).searchParams.get('q')).toBe('multatuli havelaar');
  });

  it('works without a key and copes with no items', async () => {
    const fetch = vi.fn<FetchLike>(async () => json({ totalItems: 0 }));
    await expect(new GoogleBooksProvider(http(fetch), undefined).search(query)).resolves.toEqual(
      [],
    );
    expect(new URL(fetch.mock.calls[0]![0]).searchParams.has('key')).toBe(false);
  });

  it('reads a volume', async () => {
    const { fetch } = fakeProviders();
    const gb = new GoogleBooksProvider(http(fetch), undefined);
    expect(await gb.getWork('gbTulips22')).toMatchObject({
      title: 'Tulpen in de Sneeuw',
      authors: ['Fenna de Wit'],
    });
    expect(await gb.getWork('gbMissing1')).toBeNull();
    expect(await gb.getWork('a/b')).toBeNull();
  });

  it('throws on unknown shapes', async () => {
    const gb = new GoogleBooksProvider(
      http(async () => json({ items: 'x' })),
      undefined,
    );
    await expect(gb.search(query)).rejects.toThrow('unknown shape');
    await expect(gb.getWork('abcd')).rejects.toThrow('unknown shape');
  });

  it('keeps a publication date only when it is a full date (BRK-13)', async () => {
    const volume = (publishedDate: string) =>
      new GoogleBooksProvider(
        http(async () => json({ id: 'gbLedger1', volumeInfo: { title: 'X', publishedDate } })),
        undefined,
      ).getWork('gbLedger1');
    expect((await volume('2026-11-02'))!.releaseDate).toBe('2026-11-02');
    expect((await volume('2026-11'))!.releaseDate).toBeNull();
    expect((await volume('2026'))!.releaseDate).toBeNull();
    expect((await volume('2026-13-01'))!.releaseDate).toBeNull();
  });
});
