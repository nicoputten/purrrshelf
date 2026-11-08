/**
 * Invented and public-domain books as the three metadata providers would
 * return them. ISBNs are made up (valid check digits, no real editions).
 */
import { vi } from 'vitest';
import type { FetchLike } from '../src/modules/discover/http.js';

export const ISBN_HAVELAAR = '9780000000019';
export const ISBN_SALT_ROAD = '9780000000026';
/** ISBN-10 of a Google Books edition that only matches by title + author. */
export const ISBN10_HAVELAAR_GB = '0000000051';

/** Fake JWT with an `exp` claim (not signed by anyone). */
export function fakeJwt(exp: Date): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ exp: Math.floor(exp.getTime() / 1000) })}.sig`;
}

export const hardcover = {
  search: {
    data: {
      search: {
        results: {
          found: 3,
          hits: [
            {
              document: {
                id: '101',
                title: 'Max Havelaar',
                subtitle: '',
                author_names: ['Multatuli'],
                isbns: [ISBN_HAVELAAR],
                release_year: 1860,
                image: { url: 'https://assets.hardcover.example.invalid/101.jpg' },
              },
            },
            {
              document: {
                id: 301,
                title: 'The Salt Road',
                author_names: ['Ilse Varenkamp'],
                isbns: [ISBN_SALT_ROAD],
                release_year: 2019,
                image: null,
                featured_series: {
                  position: 1,
                  series: { id: 77, name: 'Lantern Keepers', primary_books_count: 3 },
                },
              },
            },
            // Unusable records are dropped.
            { document: { title: 'No id' } },
          ],
        },
      },
    },
  },
  book101: {
    data: {
      books: [
        {
          id: 101,
          title: 'Max Havelaar',
          subtitle: null,
          description: 'A colonial administrator tells the truth about coffee.',
          release_year: 1860,
          pages: 352,
          cached_image: { url: 'https://assets.hardcover.example.invalid/101.jpg' },
          cached_contributors: [{ author: { name: 'Multatuli' } }, { author: null }],
          cached_tags: { Genre: [{ tag: 'Classics' }, { tag: 'Satire' }] },
          book_series: [],
          editions: [
            { isbn_13: ISBN_HAVELAAR, isbn_10: null, language: { code2: 'nl' } },
            { isbn_13: null, isbn_10: null, language: null },
          ],
        },
      ],
    },
  },
  book301: {
    data: {
      books: [
        {
          id: 301,
          title: 'The Salt Road',
          description: 'First of the Lantern Keepers.',
          release_year: 2019,
          cached_contributors: [{ author: { name: 'Ilse Varenkamp' } }],
          book_series: [
            { position: 1, series: { id: 77, name: 'Lantern Keepers', primary_books_count: 3 } },
          ],
          editions: [{ isbn_13: ISBN_SALT_ROAD, language: { code2: 'en' } }],
        },
      ],
    },
  },
  series77: {
    data: {
      series: [
        {
          id: 77,
          name: 'Lantern Keepers',
          primary_books_count: 3,
          book_series: [
            { position: null, book: { id: 399, title: 'Lantern Keepers Box Set' } },
            {
              position: 1,
              book: {
                id: 301,
                title: 'The Salt Road',
                cached_contributors: [{ author: { name: 'Ilse Varenkamp' } }],
              },
            },
            { position: 1, book: { id: 311, title: 'De Zoutweg' } },
            {
              position: 2,
              book: {
                id: 302,
                title: 'The Glass Harbour',
                release_year: 2021,
                cached_image: { url: 'https://assets.hardcover.example.invalid/302.jpg' },
              },
            },
            { position: 3, book: { title: 'missing id' } },
          ],
        },
      ],
    },
  },
  empty: { data: { books: [] } },
};

export const openLibrary = {
  search: {
    numFound: 2,
    docs: [
      {
        key: '/works/OL101W',
        title: 'Max Havelaar',
        author_name: ['Multatuli'],
        isbn: [ISBN_HAVELAAR, 'not-an-isbn'],
        language: ['dut', 'eng'],
        first_publish_year: 1860,
        cover_i: 555,
      },
      {
        key: '/works/OL202W',
        title: 'Pride and Prejudice',
        author_name: ['Jane Austen'],
        language: ['eng'],
        first_publish_year: 1813,
        cover_i: -1,
      },
      { key: '/books/OL1M', title: 'An edition, not a work' },
    ],
  },
  work202: {
    title: 'Pride and Prejudice',
    description: { type: '/type/text', value: 'Five sisters and one very proud man.' },
    covers: [777],
    subjects: ['Courtship', 'England'],
    first_publish_date: '1813',
    authors: [{ author: { key: '/authors/OL21A' } }, { author: { key: '/bad/key' } }],
  },
  author21: { name: 'Jane Austen' },
};

export const googleBooks = {
  search: {
    totalItems: 2,
    items: [
      {
        id: 'gbHavelaar1',
        volumeInfo: {
          title: 'Max Havelaar: of de koffij-veilingen',
          authors: ['Multatuli'],
          publishedDate: '1860-05',
          industryIdentifiers: [{ type: 'ISBN_10', identifier: ISBN10_HAVELAAR_GB }],
          language: 'nl',
          imageLinks: { thumbnail: 'http://books.example.invalid/gb1?zoom=1&edge=curl' },
        },
      },
      {
        id: 'gbTulips22',
        volumeInfo: {
          title: 'Tulpen in de Sneeuw',
          authors: ['Fenna de Wit'],
          publishedDate: '2022',
          language: 'nl',
          description: '<p>Een <b>roman</b> over&nbsp;winter.</p><p>Deel twee.</p>',
          categories: ['Fiction'],
          pageCount: 210,
        },
      },
      { id: 'broken' },
    ],
  },
  volumeTulips: {
    id: 'gbTulips22',
    volumeInfo: {
      title: 'Tulpen in de Sneeuw',
      authors: ['Fenna de Wit'],
      publishedDate: '2022',
      language: 'nl',
      description: 'Een roman over winter.',
    },
  },
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

/** A fake internet with the three providers; tests can override single routes. */
export function fakeProviders(overrides: Partial<Record<string, Handler>> = {}) {
  const routes: Record<string, Handler> = {
    'hardcover:Search': () => json(hardcover.search),
    'hardcover:Book': (_u, init) => {
      const { variables } = JSON.parse(String(init?.body)) as { variables: { id: number } };
      if (variables.id === 101) return json(hardcover.book101);
      if (variables.id === 301) return json(hardcover.book301);
      return json(hardcover.empty);
    },
    'hardcover:Series': () => json(hardcover.series77),
    'openlibrary:search': () => json(openLibrary.search),
    'openlibrary:work': (u) =>
      u.pathname === '/works/OL202W.json' ? json(openLibrary.work202) : json({}, 404),
    'openlibrary:author': () => json(openLibrary.author21),
    'googlebooks:search': () => json(googleBooks.search),
    'googlebooks:volume': (u) =>
      u.pathname.endsWith('/gbTulips22') ? json(googleBooks.volumeTulips) : json({}, 404),
    ...overrides,
  };

  const route = (url: URL, init?: RequestInit): string => {
    if (url.host === 'api.hardcover.app') {
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      return `hardcover:${query.match(/^query (\w+)/)?.[1]}`;
    }
    if (url.host === 'openlibrary.org') {
      if (url.pathname === '/search.json') return 'openlibrary:search';
      if (url.pathname.startsWith('/authors/')) return 'openlibrary:author';
      return 'openlibrary:work';
    }
    if (url.host === 'www.googleapis.com') {
      return url.pathname === '/books/v1/volumes' ? 'googlebooks:search' : 'googlebooks:volume';
    }
    return 'unknown';
  };

  const fetch = vi.fn<FetchLike>(async (input, init) => {
    const url = new URL(input);
    const handler = routes[route(url, init)];
    if (!handler) throw new Error(`unexpected request to ${url.host}`);
    return handler(url, init);
  });
  /** Requests per route name. */
  const calls = (name: string) =>
    fetch.mock.calls.filter(([input, init]) => route(new URL(input), init) === name).length;
  return { fetch, calls };
}
