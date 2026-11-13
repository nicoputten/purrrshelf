import { afterEach, describe, expect, it } from 'vitest';
import { Health } from '@purrshelf/contract';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/index.js';
import type { LibraryBook } from '../src/modules/library/types.js';
import { libraryBookLookup } from '../src/modules/search/library-book-lookup.js';
import { testConfig } from './helpers.js';

const book = { id: 9, title: 'Salt and Ember', series: null } as LibraryBook;

describe('libraryBookLookup', () => {
  const query = {
    title: 'Salt and Ember: A Novel',
    authors: ['Ada Quill'],
    language: 'en' as const,
  };

  it('finds a book by ISBN first', async () => {
    const calls: unknown[] = [];
    const lookup = libraryBookLookup({
      findBooks: async (q) => (calls.push(q), q.isbns ? [book] : []),
    });
    expect(await lookup.findBook({ ...query, isbn13: '9780000000002' })).toEqual({
      calibreBookId: 9,
    });
    expect(calls).toEqual([{ isbns: ['9780000000002'], limit: 1 }]);
  });

  it('falls back to the cleaned title and first author', async () => {
    const calls: unknown[] = [];
    const lookup = libraryBookLookup({
      findBooks: async (q) => (calls.push(q), q.title ? [book] : []),
    });
    expect(await lookup.findBook({ ...query, isbn13: '9780000000002' })).toEqual({
      calibreBookId: 9,
    });
    expect(calls[1]).toEqual({ title: 'Salt and Ember', author: 'Ada Quill', limit: 10 });
  });

  it('skips another book of the same series (BRK-15)', async () => {
    const first = {
      title: 'Lantern Keepers',
      authors: ['Ada Quill'],
      language: 'en' as const,
      series: { name: 'The Lantern Keepers', position: 1 },
    };
    const fifth = { id: 5, title: 'The Salt Choir: Lantern Keepers Book 5', series: null };
    const filed = {
      id: 6,
      title: 'Lantern Keepers',
      series: { name: 'Lantern Keepers', index: 2 },
    };
    const other = { id: 7, title: 'Lantern Keepers', series: { name: 'Harbour Tales', index: 3 } };
    const right = {
      id: 1,
      title: 'Lantern Keepers',
      series: { name: 'Lantern Keepers', index: 1 },
    };
    const lookup = (books: unknown[]) =>
      libraryBookLookup({ findBooks: async () => books as LibraryBook[] });
    expect(await lookup([fifth, filed, right]).findBook(first)).toEqual({ calibreBookId: 1 });
    expect(await lookup([fifth, filed]).findBook(first)).toBeNull();
    expect(await lookup([other]).findBook(first)).toEqual({ calibreBookId: 7 });
    expect(
      await lookup([filed]).findBook({
        ...first,
        series: { name: 'Lantern Keepers', position: null },
      }),
    ).toEqual({ calibreBookId: 6 });
  });

  it('answers null when the library has nothing, also without author', async () => {
    const calls: unknown[] = [];
    const lookup = libraryBookLookup({ findBooks: async (q) => (calls.push(q), []) });
    expect(await lookup.findBook({ ...query, authors: [] })).toBeNull();
    expect(calls).toEqual([{ title: 'Salt and Ember', limit: 10 }]);
  });
});

describe('config', () => {
  it('requires the SABnzbd key with its URL', () => {
    expect(() => testConfig({ SABNZBD_URL: 'http://sabnzbd.example.invalid:8080' })).toThrow(
      /SABNZBD_API_KEY: required with SABNZBD_URL/,
    );
    expect(testConfig()).toMatchObject({
      SABNZBD_CATEGORY: 'kobopush',
      DOWNLOADS_PATH: '/downloads',
      IMPORT_TIMEOUT_MINUTES: 30,
    });
  });
});

describe('downloads wiring', () => {
  let close: () => Promise<void> = async () => undefined;
  afterEach(async () => close());

  it('adds a SABnzbd health check from config', async () => {
    const database = openDatabase(':memory:');
    const app = await buildApp({
      config: testConfig({
        SABNZBD_URL: 'http://127.0.0.1:1',
        SABNZBD_API_KEY: 'fake-sab-key',
      }),
      database,
    });
    close = async () => {
      await app.close();
      database.close();
    };
    const health = Health.parse((await app.inject({ url: '/api/v1/health' })).json());
    expect(health.checks.find((c) => c.name === 'sabnzbd')).toMatchObject({ status: 'fail' });
  });

  it('uses an injected download client and the library lookup', async () => {
    const database = openDatabase(':memory:');
    const app = await buildApp({
      config: testConfig(),
      database,
      sab: {
        add: async () => 'x',
        status: async () => ({ state: 'missing' }),
        remove: async () => {},
        ping: async () => {},
      },
    });
    close = async () => {
      await app.close();
      database.close();
    };
    const health = Health.parse((await app.inject({ url: '/api/v1/health' })).json());
    expect(health.checks.find((c) => c.name === 'sabnzbd')).toMatchObject({ status: 'ok' });
  });
});
