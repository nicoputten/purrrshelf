import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { FakeCwa, READER_A, READER_B, uuidOf } from './fake-cwa.js';

let cwa: FakeCwa;
let adapter: CwaAdapter;

beforeEach(() => {
  cwa = new FakeCwa();
  cwa.addBook({ id: 10, title: 'The Lighthouse Cat', authors: ['Ada Quillfeather'] });
  cwa.addBook({ id: 11, title: 'A Map of Quiet Rivers', authors: ['Bram Inkwell'] });
  adapter = cwa.adapter();
});

afterEach(() => {
  adapter.close();
  cwa.close();
});

const shelfBooks = (shelfId: number) =>
  (
    cwa.app.prepare('select book_id from book_shelf_link where shelf = ?').all(shelfId) as {
      book_id: number;
    }[]
  ).map((r) => r.book_id);

describe('CwaAdapter: books', () => {
  it('finds and gets books from metadata.db', async () => {
    expect((await adapter.findBooks({ title: 'quiet' })).map((b) => b.id)).toEqual([11]);
    expect((await adapter.getBook(10))?.uuid).toBe(uuidOf(10));
    expect(await adapter.getBook(99)).toBeNull();
  });
});

describe('CwaAdapter: Kobo shelf lookup', () => {
  it('resolves each owner’s shelf by owner and name, not by a configured id', () => {
    expect(adapter.resolveKoboShelf(READER_A)).toEqual({
      id: 2,
      uuid: 'shelf-kobo-a',
      name: 'Kobo',
      userId: 3,
      koboSync: true,
    });
    expect(adapter.resolveKoboShelf(READER_B).id).toBe(3);
  });

  it('follows a shelf that was recreated with a new id', () => {
    cwa.app.exec(`delete from shelf where id = 2;
      insert into shelf (id, uuid, name, is_public, user_id, kobo_sync) values (7, 'new-a', 'Kobo', 0, 3, 1)`);
    expect(adapter.resolveKoboShelf(READER_A).id).toBe(7);
  });

  it('reports an unknown CWA user', () => {
    expect(() => adapter.resolveKoboShelf({ cwaUserId: 42 })).toThrow(
      expect.objectContaining({ code: 'LIBRARY_UNAVAILABLE', statusCode: 502 }),
    );
  });

  it('reports a missing shelf without creating one', () => {
    expect(() => adapter.resolveKoboShelf({ cwaUserId: 6 })).toThrow(
      expect.objectContaining({
        code: 'KOBO_SHELF_MISSING',
        statusCode: 409,
        message: 'CWA user 6 has no shelf named "Kobo"',
        details: { cwaUserId: 6, shelfName: 'Kobo' },
      }),
    );
    expect(cwa.app.prepare('select count(*) as n from shelf where user_id = 6').get()).toEqual({
      n: 0,
    });
  });

  it('reports two shelves with the same name', () => {
    cwa.app.exec(
      `insert into shelf (uuid, name, is_public, user_id, kobo_sync) values ('dup', 'Kobo', 0, 3, 1)`,
    );
    expect(() => adapter.resolveKoboShelf(READER_A)).toThrow(
      expect.objectContaining({
        code: 'KOBO_SHELF_MISSING',
        message: expect.stringContaining('more than one'),
      }),
    );
  });

  it('reports a shelf with Kobo sync off', () => {
    cwa.app.exec(`update shelf set kobo_sync = 0 where id = 2`);
    expect(() => adapter.resolveKoboShelf(READER_A)).toThrow(
      expect.objectContaining({
        code: 'KOBO_SHELF_MISSING',
        message: expect.stringContaining('sync switched off'),
      }),
    );
  });
});

describe('CwaAdapter: shelf changes', () => {
  it('adds and removes through the owner’s Kobo API, on that owner’s shelf only', async () => {
    await adapter.addToKoboShelf(READER_A, 10);
    await adapter.addToKoboShelf(READER_A, 10);
    expect(shelfBooks(2)).toEqual([10]);
    expect(shelfBooks(3)).toEqual([]);

    const add = cwa.calls.find((c) => c.path.startsWith('/kobo/'))!;
    expect(add.path).toBe('/kobo/kobo-token-a/v1/library/tags/shelf-kobo-a/items');
    expect(JSON.parse(add.body)).toEqual({
      Items: [{ Type: 'ProductRevisionTagItem', RevisionId: uuidOf(10) }],
    });

    await adapter.addToKoboShelf(READER_B, 10);
    await adapter.removeFromKoboShelf(READER_A, 10);
    await adapter.removeFromKoboShelf(READER_A, 10);
    expect(shelfBooks(2)).toEqual([]);
    expect(shelfBooks(3)).toEqual([10]);
    // Shelf edits never need the service account's web session.
    expect(cwa.calls.some((c) => c.path === '/login')).toBe(false);
  });

  it('needs the owner’s Kobo sync token', async () => {
    cwa.app.exec(`delete from remote_auth_token where user_id = 3`);
    await expect(adapter.addToKoboShelf(READER_A, 10)).rejects.toMatchObject({
      code: 'KOBO_SYNC_NOT_SET_UP',
      statusCode: 409,
      details: { cwaUserId: 3 },
    });
  });

  it('refuses a book that is not in the library', async () => {
    await expect(adapter.addToKoboShelf(READER_A, 99)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('checks that CWA really changed the shelf', async () => {
    cwa.behaviour.ignoreShelfChanges = true;
    await expect(adapter.addToKoboShelf(READER_A, 10)).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      message: expect.stringContaining('not on the shelf'),
    });
    cwa.app.exec(`insert into book_shelf_link (book_id, shelf) values (10, 2)`);
    await expect(adapter.removeFromKoboShelf(READER_A, 10)).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      message: expect.stringContaining('still on the shelf'),
    });
  });

  it('turns a refused Kobo call into LIBRARY_UNAVAILABLE without leaking the token', async () => {
    cwa.behaviour.override = (call) =>
      call.path.includes('/kobo/') ? new Response(null, { status: 404 }) : undefined;
    const err = await adapter.addToKoboShelf(READER_A, 10).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'LIBRARY_UNAVAILABLE', details: { status: 404 } });
    expect(JSON.stringify(err)).not.toContain('kobo-token-a');
    expect((err as Error).message).not.toContain('kobo-token-a');
  });
});

describe('CwaAdapter: device and reading state', () => {
  it('reports shelf and device state per owner', async () => {
    cwa.app.exec(`insert into book_shelf_link (book_id, shelf) values (10, 2);
      insert into kobo_synced_books (user_id, book_id) values (3, 10), (4, 11)`);
    expect(await adapter.getDeviceState(READER_A, 10)).toEqual({
      onKoboShelf: true,
      syncedToDevice: true,
    });
    expect(await adapter.getDeviceState(READER_B, 10)).toEqual({
      onKoboShelf: false,
      syncedToDevice: false,
    });
    expect(await adapter.getDeviceState(READER_B, 11)).toEqual({
      onKoboShelf: false,
      syncedToDevice: true,
    });
  });

  it('reports reading state from the Kobo sync tables', async () => {
    cwa.app.exec(`
      insert into book_read_link (book_id, user_id, read_status, last_modified) values (10, 3, 2, '2026-03-01 10:00:00.000000');
      insert into kobo_reading_state (id, user_id, book_id, last_modified) values (1, 3, 10, '2026-03-02 21:30:00.123456');
      insert into kobo_bookmark (kobo_reading_state_id, progress_percent) values (1, 42.5);
      insert into kobo_statistics (kobo_reading_state_id, spent_reading_minutes, remaining_time_minutes) values (1, 95, 130);
      insert into book_read_link (book_id, user_id, read_status, last_modified) values (11, 3, 1, '2026-02-01 08:00:00');
    `);
    expect(await adapter.getReadingState(READER_A, 10)).toEqual({
      status: 'reading',
      progressPercent: 42.5,
      spentReadingMinutes: 95,
      remainingMinutes: 130,
      lastModified: new Date('2026-03-02T21:30:00.123Z'),
    });
    expect(await adapter.getReadingState(READER_A, 11)).toEqual({
      status: 'finished',
      progressPercent: null,
      spentReadingMinutes: null,
      remainingMinutes: null,
      lastModified: new Date('2026-02-01T08:00:00Z'),
    });
    expect(await adapter.getReadingState(READER_B, 10)).toEqual({
      status: 'unread',
      progressPercent: null,
      spentReadingMinutes: null,
      remainingMinutes: null,
      lastModified: null,
    });
  });

  it('reads every book’s reading state for one reader at once, newest row winning', async () => {
    cwa.app.exec(`
      insert into book_read_link (book_id, user_id, read_status, last_modified) values (10, 3, 2, '2026-03-01 10:00:00');
      insert into book_read_link (book_id, user_id, read_status, last_modified) values (10, 3, 1, '2026-03-05 10:00:00');
      insert into book_read_link (book_id, user_id, read_status) values (10, 4, 1);
      insert into kobo_reading_state (id, user_id, book_id, last_modified) values (1, 3, 11, '2026-03-02 21:30:00');
      insert into kobo_bookmark (kobo_reading_state_id, progress_percent) values (1, 12);
    `);
    const states = await adapter.getReadingStates(READER_A);
    expect([...states.keys()].sort()).toEqual([10, 11]);
    expect(states.get(10)).toMatchObject({
      status: 'finished',
      lastModified: new Date('2026-03-05T10:00:00Z'),
    });
    expect(states.get(11)).toMatchObject({ status: 'unread', progressPercent: 12 });
    expect(await adapter.getReadingStates({ cwaUserId: 99 })).toEqual(new Map());
  });

  it('treats an unknown read status as unread', async () => {
    cwa.app.exec(`insert into book_read_link (book_id, user_id, read_status) values (10, 3, 9)`);
    expect((await adapter.getReadingState(READER_A, 10)).status).toBe('unread');
  });
});

describe('CwaAdapter: deleting books', () => {
  it('deletes through the web UI as the service account with CSRF', async () => {
    await adapter.deleteBook(11);
    expect(await adapter.getBook(11)).toBeNull();
    const del = cwa.calls.find((c) => c.path === '/ajax/delete/11')!;
    expect(del.headers.get('x-csrftoken')).toBe('fake-csrf-token');
    expect(new URLSearchParams(del.body).get('csrf_token')).toBe('fake-csrf-token');
    // One login is reused for later deletes.
    await adapter.deleteBook(10);
    expect(cwa.calls.filter((c) => c.path === '/login' && c.method === 'POST')).toHaveLength(1);
  });

  it('logs in again when CWA forgot the session', async () => {
    await adapter.deleteBook(11);
    cwa.expireSessions();
    await adapter.deleteBook(10);
    expect(cwa.calls.filter((c) => c.path === '/login' && c.method === 'POST')).toHaveLength(2);
    expect(await adapter.getBook(10)).toBeNull();
  });

  it('refuses a book that is not in the library', async () => {
    await expect(adapter.deleteBook(99)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reports an HTTP error from CWA', async () => {
    cwa.behaviour.override = (call) =>
      call.path.startsWith('/ajax/') ? new Response('boom', { status: 500 }) : undefined;
    await expect(adapter.deleteBook(11)).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      details: { bookId: 11, status: 500 },
    });
  });

  it('reports CWA’s own error message', async () => {
    cwa.behaviour.deleteAnswer = {
      location: '/admin/book/11',
      type: 'danger',
      format: '',
      message: 'You are missing permissions to delete books',
    };
    await expect(adapter.deleteBook(11)).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      details: { cwaMessage: 'You are missing permissions to delete books' },
    });
    cwa.behaviour.deleteAnswer = [{ type: 'danger' }];
    await expect(adapter.deleteBook(11)).rejects.toMatchObject({ details: { cwaMessage: '' } });
  });

  it('checks that the book is really gone', async () => {
    cwa.behaviour.deleteAnswer = [null, { type: 'success' }];
    await expect(adapter.deleteBook(11)).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      message: expect.stringContaining('still in the library'),
    });
    cwa.behaviour.deleteAnswer = undefined;
    cwa.behaviour.override = (call) =>
      call.path.startsWith('/ajax/') ? new Response('<html>ok</html>') : undefined;
    await expect(adapter.deleteBook(11)).rejects.toMatchObject({
      message: expect.stringContaining('still in the library'),
    });
  });
});

describe('CwaAdapter: health', () => {
  it('pings both databases and logs in once', async () => {
    await adapter.ping();
    await adapter.ping();
    expect(cwa.calls.filter((c) => c.path === '/login' && c.method === 'POST')).toHaveLength(1);
  });

  it('fails when a database is missing', async () => {
    const broken = cwa.adapter();
    cwa.app.exec('drop table user');
    await expect(broken.ping()).rejects.toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
    broken.close();
  });
});
