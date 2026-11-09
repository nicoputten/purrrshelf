import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalibreDb, normaliseIsbn } from '../../src/modules/library/calibre-db.js';
import { parseSqliteTime } from '../../src/modules/library/sqlite-readonly.js';
import { FakeCwa, uuidOf } from './fake-cwa.js';

let cwa: FakeCwa;
let db: CalibreDb;

beforeEach(() => {
  cwa = new FakeCwa();
  cwa.addBook({
    id: 1,
    title: 'The Lighthouse Cat',
    authors: ['Ada Quillfeather', 'Cleo Driftwood'],
    series: { name: 'Harbour Tales', index: 2.5 },
    identifiers: [
      { type: 'isbn', val: '979-8-00-000001-4' },
      { type: 'ISBN13', val: '9798000000014' },
      { type: 'goodreads', val: '12345' },
    ],
    formats: ['epub', 'AZW3'],
    tags: ['Mystery', 'Cosy'],
    languages: ['nld', 'eng'],
  });
  cwa.addBook({ id: 2, title: '100% Cotton_Socks', authors: ['Bram Inkwell'], timestamp: null });
  cwa.addBook({
    id: 3,
    title: 'Untitled',
    formats: [],
    identifiers: [{ type: 'isbn10', val: '0-00-000000-X' }],
  });
  db = new CalibreDb(cwa.metadataDbPath);
});

afterEach(() => {
  db.close();
  cwa.close();
});

const ids = (books: { id: number }[]) => books.map((b) => b.id);

describe('CalibreDb', () => {
  it('maps a book with authors, series, ISBNs and formats', () => {
    expect(db.getBook(1)).toEqual({
      id: 1,
      uuid: uuidOf(1),
      mediaType: 'ebook',
      title: 'The Lighthouse Cat',
      authors: ['Ada Quillfeather', 'Cleo Driftwood'],
      series: { name: 'Harbour Tales', index: 2.5 },
      isbns: ['9798000000014'],
      formats: ['AZW3', 'EPUB'],
      tags: ['Cosy', 'Mystery'],
      languages: ['nl', 'en'],
      path: 'Author/The Lighthouse Cat (1)',
      addedAt: new Date('2026-01-02T03:04:05.678Z'),
    });
  });

  it('copes with a book without authors, series, formats or timestamp', () => {
    expect(db.getBook(2)).toMatchObject({ series: null, addedAt: new Date(0) });
    expect(db.getBook(3)).toMatchObject({
      authors: [],
      formats: [],
      isbns: ['000000000X'],
      tags: [],
      languages: [],
    });
    expect(db.getBook(4)).toBeNull();
  });

  it('finds by id, uuid and ISBN in any notation', () => {
    expect(ids(db.findBooks({ ids: [3, 1] }))).toEqual([1, 3]);
    expect(ids(db.findBooks({ uuids: [uuidOf(2)] }))).toEqual([2]);
    expect(ids(db.findBooks({ isbns: ['979 8000 000014'] }))).toEqual([1]);
    expect(ids(db.findBooks({ isbns: ['000000000x'] }))).toEqual([3]);
    expect(ids(db.findBooks({ isbns: ['12345'] }))).toEqual([]);
  });

  it('finds by any identifier, type compared case-insensitively', () => {
    expect(ids(db.findBooks({ identifier: { type: 'GoodReads', value: '12345' } }))).toEqual([1]);
    expect(ids(db.findBooks({ identifier: { type: 'goodreads', value: '999' } }))).toEqual([]);
  });

  it('returns nothing for empty id, uuid or ISBN lists', () => {
    expect(db.findBooks({ ids: [] })).toEqual([]);
    expect(db.findBooks({ uuids: [] })).toEqual([]);
    expect(db.findBooks({ isbns: ['--'] })).toEqual([]);
  });

  it('finds by title and author substrings, case-insensitively, with LIKE characters escaped', () => {
    expect(ids(db.findBooks({ title: 'lighthouse' }))).toEqual([1]);
    expect(ids(db.findBooks({ author: 'DRIFTWOOD' }))).toEqual([1]);
    expect(ids(db.findBooks({ title: '100%' }))).toEqual([2]);
    expect(ids(db.findBooks({ title: '_' }))).toEqual([2]);
    expect(ids(db.findBooks({ title: '%' }))).toEqual([2]);
    expect(ids(db.findBooks({ title: 'cat', author: 'inkwell' }))).toEqual([]);
  });

  it('limits results', () => {
    expect(ids(db.findBooks({}))).toEqual([1, 2, 3]);
    expect(ids(db.findBooks({ limit: 2 }))).toEqual([1, 2]);
    expect(ids(db.findBooks({ limit: 0 }))).toEqual([1]);
  });

  it('pages through the library by id', () => {
    expect(ids(db.findBooks({ afterId: 0, limit: 2 }))).toEqual([1, 2]);
    expect(ids(db.findBooks({ afterId: 2, limit: 2 }))).toEqual([3]);
    expect(ids(db.findBooks({ afterId: 3 }))).toEqual([]);
  });

  it('pings', () => {
    expect(() => db.ping()).not.toThrow();
  });

  it('reports a missing database as LIBRARY_UNAVAILABLE', () => {
    const missing = new CalibreDb(join(cwa.dir, 'nope.db'));
    expect(() => missing.ping()).toThrow(
      expect.objectContaining({
        code: 'LIBRARY_UNAVAILABLE',
        message: 'Cannot open Calibre metadata.db',
      }),
    );
    missing.close();
  });

  it('reports a broken database as LIBRARY_UNAVAILABLE', () => {
    cwa.metadata.exec('drop table data');
    expect(() => db.getBook(1)).toThrow(
      expect.objectContaining({
        code: 'LIBRARY_UNAVAILABLE',
        message: 'Cannot read Calibre metadata.db',
      }),
    );
  });

  it('opens read-only', () => {
    db.ping();
    // @ts-expect-error reaching into the private handle on purpose
    expect(() => db.sqlite.db.exec('delete from books')).toThrow(/readonly/);
  });
});

describe('normaliseIsbn', () => {
  it('keeps digits and X', () => {
    expect(normaliseIsbn('979-8-00-000001-4')).toBe('9798000000014');
    expect(normaliseIsbn(' 0-00-000000-x ')).toBe('000000000X');
  });
});

describe('parseSqliteTime', () => {
  it('reads Calibre and SQLAlchemy times as UTC', () => {
    expect(parseSqliteTime('2026-01-02 03:04:05.678901+00:00')).toEqual(
      new Date('2026-01-02T03:04:05.678Z'),
    );
    expect(parseSqliteTime('2026-01-02 03:04:05')).toEqual(new Date('2026-01-02T03:04:05Z'));
    expect(parseSqliteTime('2026-01-02T03:04:05+02:00')).toEqual(new Date('2026-01-02T01:04:05Z'));
  });

  it('returns null for empty or broken values', () => {
    expect(parseSqliteTime(null)).toBeNull();
    expect(parseSqliteTime(undefined)).toBeNull();
    expect(parseSqliteTime('')).toBeNull();
    expect(parseSqliteTime('yesterday')).toBeNull();
  });
});
