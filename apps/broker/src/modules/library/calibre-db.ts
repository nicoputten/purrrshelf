import { languageCode } from '../discover/normalise.js';
import { parseSqliteTime, ReadOnlySqlite } from './sqlite-readonly.js';
import type { FindBooksQuery, LibraryBook } from './types.js';

interface BookRow {
  id: number;
  uuid: string;
  title: string;
  path: string;
  timestamp: string | null;
  series_index: number;
  series: string | null;
}

const ISBN_TYPES = ['isbn', 'isbn10', 'isbn13'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/** Normalises an ISBN to digits (and a trailing X for ISBN-10). */
export function normaliseIsbn(isbn: string): string {
  return isbn.toUpperCase().replace(/[^0-9X]/g, '');
}

/** Read-only queries on Calibre's `metadata.db`. */
export class CalibreDb {
  private readonly sqlite: ReadOnlySqlite;

  constructor(path: string) {
    this.sqlite = new ReadOnlySqlite(path, 'Calibre metadata.db');
  }

  ping(): void {
    this.sqlite.run((db) => db.prepare('select count(*) from books').get());
  }

  findBooks(query: FindBooksQuery): LibraryBook[] {
    const where: string[] = [];
    const params: unknown[] = [];
    const inList = (column: string, values: readonly unknown[]) => {
      where.push(`${column} in (${values.map(() => '?').join(', ')})`);
      params.push(...values);
    };

    if (query.ids) {
      if (query.ids.length === 0) return [];
      inList('b.id', query.ids);
    }
    if (query.uuids) {
      if (query.uuids.length === 0) return [];
      inList('b.uuid', query.uuids);
    }
    if (query.isbns) {
      const isbns = query.isbns.map(normaliseIsbn).filter((i) => i.length > 0);
      if (isbns.length === 0) return [];
      where.push(
        `b.id in (select book from identifiers where lower(type) in (${ISBN_TYPES.map(() => '?').join(', ')})
          and upper(replace(replace(val, '-', ''), ' ', '')) in (${isbns.map(() => '?').join(', ')}))`,
      );
      params.push(...ISBN_TYPES, ...isbns);
    }
    if (query.identifier) {
      where.push('b.id in (select book from identifiers where lower(type) = ? and val = ?)');
      params.push(query.identifier.type.toLowerCase(), query.identifier.value);
    }
    if (query.afterId !== undefined) {
      where.push('b.id > ?');
      params.push(query.afterId);
    }
    if (query.title) {
      where.push(`b.title like ? escape '\\' collate nocase`);
      params.push(`%${escapeLike(query.title)}%`);
    }
    if (query.author) {
      where.push(
        `b.id in (select bal.book from books_authors_link bal join authors a on a.id = bal.author
          where a.name like ? escape '\\' collate nocase)`,
      );
      params.push(`%${escapeLike(query.author)}%`);
    }

    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const sql = `select b.id, b.uuid, b.title, b.path, b.timestamp, b.series_index, s.name as series
      from books b
      left join books_series_link bsl on bsl.book = b.id
      left join series s on s.id = bsl.series
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by b.id
      limit ${limit}`;

    return this.sqlite.run((db) => {
      const rows = db.prepare(sql).all(...params) as BookRow[];
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const marks = ids.map(() => '?').join(', ');
      const authors = groupBy(
        db
          .prepare(
            `select bal.book, a.name from books_authors_link bal join authors a on a.id = bal.author
             where bal.book in (${marks}) order by bal.id`,
          )
          .all(...ids) as { book: number; name: string }[],
      );
      const isbns = groupBy(
        db
          .prepare(
            `select book, val as name from identifiers
             where book in (${marks}) and lower(type) in (${ISBN_TYPES.map(() => '?').join(', ')})
             order by id`,
          )
          .all(...ids, ...ISBN_TYPES) as { book: number; name: string }[],
      );
      const tags = groupBy(
        db
          .prepare(
            `select btl.book, t.name from books_tags_link btl join tags t on t.id = btl.tag
             where btl.book in (${marks}) order by t.name`,
          )
          .all(...ids) as { book: number; name: string }[],
      );
      const languages = groupBy(
        db
          .prepare(
            `select bll.book, l.lang_code as name from books_languages_link bll
             join languages l on l.id = bll.lang_code
             where bll.book in (${marks}) order by bll.item_order, bll.id`,
          )
          .all(...ids) as { book: number; name: string }[],
      );
      const formats = groupBy(
        db
          .prepare(
            `select book, upper(format) as name from data where book in (${marks}) order by format`,
          )
          .all(...ids) as { book: number; name: string }[],
      );

      return rows.map((r): LibraryBook => ({
        id: r.id,
        uuid: r.uuid,
        mediaType: 'ebook',
        title: r.title,
        authors: authors.get(r.id) ?? [],
        series: r.series ? { name: r.series, index: r.series_index } : null,
        isbns: [...new Set((isbns.get(r.id) ?? []).map(normaliseIsbn))],
        formats: formats.get(r.id) ?? [],
        tags: tags.get(r.id) ?? [],
        languages: [
          ...new Set(
            (languages.get(r.id) ?? [])
              .map((code) => languageCode(code))
              .filter((code): code is string => code !== null),
          ),
        ],
        path: r.path,
        addedAt: parseSqliteTime(r.timestamp) ?? new Date(0),
      }));
    });
  }

  getBook(bookId: number): LibraryBook | null {
    return this.findBooks({ ids: [bookId] })[0] ?? null;
  }

  close(): void {
    this.sqlite.close();
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function groupBy(rows: { book: number; name: string }[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const { book, name } of rows) {
    const list = map.get(book);
    if (list) list.push(name);
    else map.set(book, [name]);
  }
  return map;
}
