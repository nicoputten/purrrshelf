import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import type { Fetch } from '../../src/modules/library/cwa-web.js';

/**
 * A fake CWA for unit tests: the parts of Calibre's metadata.db and CWA's
 * app.db the adapter reads, plus a fetch function that answers like CWA's
 * web UI and Kobo API and changes those databases the way CWA would.
 * The real thing is covered by the contract tests in test/contract.
 */

const METADATA_SCHEMA = `
create table books (id integer primary key, title text not null default 'Unknown', sort text,
  timestamp timestamp, pubdate timestamp, series_index real not null default 1.0, author_sort text,
  isbn text default '', lccn text default '', path text not null default '', flags integer not null default 1,
  uuid text, has_cover bool default 0, last_modified timestamp);
create table authors (id integer primary key, name text not null, sort text, link text not null default '');
create table books_authors_link (id integer primary key, book integer not null, author integer not null);
create table series (id integer primary key, name text not null, sort text);
create table books_series_link (id integer primary key, book integer not null, series integer not null);
create table identifiers (id integer primary key, book integer not null, type text not null default 'isbn', val text not null);
create table data (id integer primary key, book integer not null, format text not null, uncompressed_size integer not null, name text not null);
create table tags (id integer primary key, name text not null unique);
create table books_tags_link (id integer primary key, book integer not null, tag integer not null);
create table languages (id integer primary key, lang_code text not null unique, link text not null default '');
create table books_languages_link (id integer primary key, book integer not null, lang_code integer not null, item_order integer not null default 0);
`;

const APP_SCHEMA = `
create table user (id integer primary key, name varchar(64) unique, role smallint, kobo_only_shelves_sync integer);
create table shelf (id integer primary key, uuid varchar, name varchar, is_public integer, user_id integer, kobo_sync boolean,
  created datetime, last_modified datetime);
create table book_shelf_link (id integer primary key, book_id integer, "order" integer, shelf integer, date_added datetime);
create table remote_auth_token (id integer primary key, auth_token varchar unique, user_id integer, verified boolean,
  expiration datetime, token_type integer);
create table kobo_synced_books (id integer primary key, user_id integer, book_id integer);
create table book_read_link (id integer primary key, book_id integer, user_id integer, read_status integer not null default 0,
  last_modified datetime, last_time_started_reading datetime, times_started_reading integer not null default 0);
create table kobo_reading_state (id integer primary key, user_id integer, book_id integer, last_modified datetime,
  priority_timestamp datetime);
create table kobo_bookmark (id integer primary key, kobo_reading_state_id integer, last_modified datetime,
  location_source varchar, location_type varchar, location_value varchar, progress_percent float,
  content_source_progress_percent float);
create table kobo_statistics (id integer primary key, kobo_reading_state_id integer, last_modified datetime,
  remaining_time_minutes integer, spent_reading_minutes integer);
`;

export interface FakeBook {
  id: number;
  title: string;
  authors?: string[];
  series?: { name: string; index: number };
  identifiers?: { type: string; val: string }[];
  formats?: string[];
  timestamp?: string | null;
  tags?: string[];
  /** Calibre's ISO 639-2/3 codes, e.g. `eng`, `nld`. */
  languages?: string[];
}

export const READER_A = { cwaUserId: 3 };
export const READER_B = { cwaUserId: 4 };
export const SERVICE = { username: 'purrshelf-broker', password: 'Fake-password-1!' };
export const BASE_URL = 'http://cwa.example.invalid:8083';
export const CSRF = 'fake-csrf-token';
export const LOGIN_CSRF = 'fake-login-csrf';

export const uuidOf = (bookId: number) =>
  `00000000-0000-4000-8000-${String(bookId).padStart(12, '0')}`;

export interface Call {
  method: string;
  path: string;
  headers: Headers;
  body: string;
}

/** Hooks a test can set to make the fake misbehave. */
export interface FakeBehaviour {
  /** Answer for any request; return undefined to fall through to the normal fake. */
  override?: (call: Call) => Response | undefined;
  /** CWA answers the Kobo API with 2xx but doesn't change the shelf. */
  ignoreShelfChanges?: boolean;
  /** CWA answers the delete with this JSON body and leaves the book. */
  deleteAnswer?: unknown;
}

export class FakeCwa {
  readonly dir = mkdtempSync(join(tmpdir(), 'purrshelf-cwa-'));
  readonly metadataDbPath = join(this.dir, 'metadata.db');
  readonly appDbPath = join(this.dir, 'app.db');
  readonly metadata: Database.Database;
  readonly app: Database.Database;
  readonly calls: Call[] = [];
  readonly behaviour: FakeBehaviour = {};
  private sessions = new Set<string>();
  private nextSession = 1;

  constructor() {
    this.metadata = new Database(this.metadataDbPath);
    this.metadata.pragma('journal_mode = WAL');
    this.metadata.exec(METADATA_SCHEMA);
    this.app = new Database(this.appDbPath);
    this.app.pragma('journal_mode = WAL');
    this.app.exec(APP_SCHEMA);
    this.app.exec(`
      insert into user (id, name, role, kobo_only_shelves_sync) values
        (1, 'admin', 479, 0), (2, 'Guest', 32, 0), (3, 'reader-a', 2, 1), (4, 'reader-b', 2, 1),
        (5, '${SERVICE.username}', 130, 0), (6, 'no-shelf', 2, 1);
      insert into shelf (id, uuid, name, is_public, user_id, kobo_sync) values
        (1, 'shelf-holiday-a', 'Holiday', 0, 3, 0),
        (2, 'shelf-kobo-a', 'Kobo', 0, 3, 1),
        (3, 'shelf-kobo-b', 'Kobo', 0, 4, 1);
      insert into remote_auth_token (auth_token, user_id, verified, token_type) values
        ('kobo-token-a', 3, 0, 1), ('kobo-token-b', 4, 0, 1), ('web-token-6', 6, 0, 0);
    `);
  }

  addBook(book: FakeBook): void {
    const m = this.metadata;
    m.prepare(
      `insert into books (id, title, path, uuid, timestamp, series_index) values (?, ?, ?, ?, ?, ?)`,
    ).run(
      book.id,
      book.title,
      `Author/${book.title} (${book.id})`,
      uuidOf(book.id),
      book.timestamp === undefined ? '2026-01-02 03:04:05.678901+00:00' : book.timestamp,
      book.series?.index ?? 1,
    );
    for (const name of book.authors ?? []) {
      let author = m.prepare('select id from authors where name = ?').get(name) as
        { id: number } | undefined;
      if (!author) {
        const r = m.prepare('insert into authors (name, sort) values (?, ?)').run(name, name);
        author = { id: Number(r.lastInsertRowid) };
      }
      m.prepare('insert into books_authors_link (book, author) values (?, ?)').run(
        book.id,
        author.id,
      );
    }
    if (book.series) {
      const r = m
        .prepare('insert into series (name, sort) values (?, ?)')
        .run(book.series.name, '');
      m.prepare('insert into books_series_link (book, series) values (?, ?)').run(
        book.id,
        r.lastInsertRowid,
      );
    }
    for (const { type, val } of book.identifiers ?? []) {
      m.prepare('insert into identifiers (book, type, val) values (?, ?, ?)').run(
        book.id,
        type,
        val,
      );
    }
    for (const name of book.tags ?? []) {
      m.prepare('insert or ignore into tags (name) values (?)').run(name);
      const tag = m.prepare('select id from tags where name = ?').get(name) as { id: number };
      m.prepare('insert into books_tags_link (book, tag) values (?, ?)').run(book.id, tag.id);
    }
    for (const [order, code] of (book.languages ?? []).entries()) {
      m.prepare('insert or ignore into languages (lang_code) values (?)').run(code);
      const lang = m.prepare('select id from languages where lang_code = ?').get(code) as {
        id: number;
      };
      m.prepare(
        'insert into books_languages_link (book, lang_code, item_order) values (?, ?, ?)',
      ).run(book.id, lang.id, order);
    }
    for (const format of book.formats ?? ['EPUB']) {
      m.prepare('insert into data (book, format, uncompressed_size, name) values (?, ?, 1, ?)').run(
        book.id,
        format,
        book.title,
      );
    }
  }

  adapter(opts: { timeoutMs?: number } = {}): CwaAdapter {
    return new CwaAdapter({
      baseUrl: `${BASE_URL}/`,
      serviceUser: SERVICE.username,
      servicePassword: SERVICE.password,
      koboShelfName: 'Kobo',
      metadataDbPath: this.metadataDbPath,
      appDbPath: this.appDbPath,
      fetch: this.fetch,
      ...opts,
    });
  }

  /** Forgets every web session, as when CWA restarts. */
  expireSessions(): void {
    this.sessions.clear();
  }

  close(): void {
    this.metadata.close();
    this.app.close();
    rmSync(this.dir, { recursive: true, force: true });
  }

  readonly fetch: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    };
    this.calls.push(call);
    return this.behaviour.override?.(call) ?? this.handle(call);
  };

  private session(call: Call): string | null {
    const sid = /session=([^;]+)/.exec(call.headers.get('cookie') ?? '')?.[1];
    return sid && this.sessions.has(sid) ? sid : null;
  }

  private handle(call: Call): Response {
    const redirect = (to: string, cookie?: string) =>
      new Response(null, {
        status: 302,
        headers: { location: to, ...(cookie ? { 'set-cookie': cookie } : {}) },
      });
    const page = (csrf: string) =>
      new Response(`<form><input type="hidden" name="csrf_token" value="${csrf}"></form>`, {
        status: 200,
      });

    if (call.path === '/login' && call.method === 'GET') {
      return page(LOGIN_CSRF);
    }
    if (call.path === '/login' && call.method === 'POST') {
      const form = new URLSearchParams(call.body);
      if (
        form.get('csrf_token') !== LOGIN_CSRF ||
        form.get('username') !== SERVICE.username ||
        form.get('password') !== SERVICE.password
      ) {
        return page(LOGIN_CSRF);
      }
      const sid = `s${this.nextSession++}`;
      this.sessions.add(sid);
      return redirect('/', `session=${sid}; HttpOnly; Path=/`);
    }

    const kobo = /^\/kobo\/([^/]+)\/v1\/library\/tags\/([^/]+)\/items(\/delete)?$/.exec(call.path);
    if (kobo && call.method === 'POST')
      return this.koboTagItems(kobo[1]!, kobo[2]!, !!kobo[3], call);

    if (!this.session(call)) return redirect('/login?next=%2F');
    if (call.path === '/' && call.method === 'GET') return page(CSRF);

    const del = /^\/ajax\/delete\/(\d+)$/.exec(call.path);
    if (del && call.method === 'POST') {
      if (call.headers.get('x-csrftoken') !== CSRF) return new Response('CSRF', { status: 400 });
      if (this.behaviour.deleteAnswer !== undefined) {
        return Response.json(this.behaviour.deleteAnswer);
      }
      const id = Number(del[1]);
      for (const table of ['books_authors_link', 'books_series_link', 'identifiers', 'data']) {
        this.metadata.prepare(`delete from ${table} where book = ?`).run(id);
      }
      this.metadata.prepare('delete from books where id = ?').run(id);
      return Response.json([{ location: '/', type: 'success', format: '', message: '' }]);
    }
    return new Response('not found', { status: 404 });
  }

  private koboTagItems(token: string, shelfUuid: string, remove: boolean, call: Call): Response {
    const user = this.app
      .prepare('select user_id from remote_auth_token where auth_token = ? and token_type = 1')
      .get(decodeURIComponent(token)) as { user_id: number } | undefined;
    if (!user) return new Response(null, { status: 401 });
    const shelf = this.app
      .prepare('select id from shelf where uuid = ? and user_id = ?')
      .get(decodeURIComponent(shelfUuid), user.user_id) as { id: number } | undefined;
    if (!shelf) return new Response(null, { status: 404 });
    const items = (JSON.parse(call.body) as { Items: { RevisionId: string }[] }).Items;
    if (!this.behaviour.ignoreShelfChanges) {
      for (const { RevisionId } of items) {
        const book = this.metadata
          .prepare('select id from books where uuid = ?')
          .get(RevisionId) as { id: number } | undefined;
        if (!book) continue;
        if (remove) {
          this.app
            .prepare('delete from book_shelf_link where shelf = ? and book_id = ?')
            .run(shelf.id, book.id);
        } else if (
          !this.app
            .prepare('select 1 from book_shelf_link where shelf = ? and book_id = ?')
            .get(shelf.id, book.id)
        ) {
          this.app
            .prepare('insert into book_shelf_link (book_id, shelf) values (?, ?)')
            .run(book.id, shelf.id);
        }
      }
    }
    return new Response(remove ? '' : '', { status: remove ? 200 : 201 });
  }
}
