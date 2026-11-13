import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import type { User } from '../../src/db/schema.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { koboShelfMissing, libraryUnavailable } from '../../src/modules/library/errors.js';
import {
  KOBO_RESEND_FIRST_DELAY_MS,
  KOBO_RESEND_GRACE_MS,
  KOBO_RESEND_INTERVAL_MS,
  KOBO_RESEND_JOB,
  KOBO_RESEND_MAX_ATTEMPTS,
  KoboResender,
  KoboResendJobs,
} from '../../src/modules/library/kobo-resend.js';
import type { LibraryAdapter } from '../../src/modules/library/types.js';
import { PASSWORD, TestClock } from '../helpers.js';
import { FakeCwa, READER_A, READER_B } from './fake-cwa.js';

let cwa: FakeCwa;
let adapter: CwaAdapter;
let database: DatabaseHandle;
let clock: TestClock;
let users: UserRepository;
let reader: User;
let resender: KoboResender;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Kobo shelf ids in the fake CWA: reader A = 2, reader B = 3. */
const SHELF = { 3: 2, 4: 3 } as Record<number, number>;

beforeEach(async () => {
  cwa = new FakeCwa();
  cwa.addBook({ id: 7, title: 'The Lighthouse Cat' });
  cwa.addBook({ id: 8, title: 'A Map of Quiet Rivers' });
  adapter = cwa.adapter();
  database = openDatabase(':memory:');
  clock = new TestClock();
  users = new UserRepository(database.db, clock.fn);
  await users.create({ username: 'reader', displayName: 'Reader One', password: PASSWORD });
  reader = users.setCwaUserId('reader', READER_A.cwaUserId);
  resender = new KoboResender(database.db, clock.fn, adapter, users, log);
  vi.clearAllMocks();
});

afterEach(() => {
  adapter.close();
  cwa.close();
  database.close();
});

function putOnShelf(cwaUserId: number, bookId: number) {
  cwa.app
    .prepare('insert into book_shelf_link (book_id, shelf) values (?, ?)')
    .run(bookId, SHELF[cwaUserId]);
}

/**
 * What a Kobo sync does to CWA's tables (CWA v4.0.8, selected-shelves sync):
 * books no longer on the shelf lose their synced mark, books on the shelf
 * without one get it. With `fetch`, the Kobo then downloads them.
 */
function koboSyncs(cwaUserId: number, { fetch }: { fetch: boolean }) {
  const shelf = SHELF[cwaUserId];
  cwa.app
    .prepare(
      `delete from kobo_synced_books where user_id = ?
       and book_id not in (select book_id from book_shelf_link where shelf = ?)`,
    )
    .run(cwaUserId, shelf);
  const sent = cwa.app
    .prepare(
      `select book_id from book_shelf_link where shelf = ?
       and book_id not in (select book_id from kobo_synced_books where user_id = ?)`,
    )
    .all(shelf, cwaUserId) as { book_id: number }[];
  for (const { book_id } of sent) {
    cwa.app
      .prepare('insert into kobo_synced_books (user_id, book_id) values (?, ?)')
      .run(cwaUserId, book_id);
    if (fetch) {
      cwa.app
        .prepare('insert into downloads (user_id, book_id) values (?, ?)')
        .run(cwaUserId, book_id);
    }
  }
}

/** A book CWA marked synced in a sync whose reply never reached the Kobo. */
function lostInSync(bookId: number, cwaUserId = READER_A.cwaUserId) {
  putOnShelf(cwaUserId, bookId);
  koboSyncs(cwaUserId, { fetch: false });
}

const onShelf = async (bookId: number) =>
  (await adapter.getDeviceState(READER_A, bookId)).onKoboShelf;
const phase = (bookId: number) => resender.phaseOf(reader.id, bookId);

describe('KoboResender', () => {
  it('resends a lost book: off the shelf, a sync, back on, a sync, delivered', async () => {
    lostInSync(7);
    expect(await resender.check()).toMatchObject({ found: 1, takenOff: 0 });
    expect(phase(7)).toBe('waiting');

    clock.advance(KOBO_RESEND_GRACE_MS - 1);
    expect(await resender.check()).toMatchObject({ found: 0, takenOff: 0 });
    expect(await onShelf(7)).toBe(true);

    clock.advance(1);
    expect(await resender.check()).toMatchObject({ takenOff: 1 });
    expect(await onShelf(7)).toBe(false);
    expect(phase(7)).toBe('off_shelf');
    expect(log.info).toHaveBeenCalledWith(
      { userId: reader.id, calibreBookId: 7, attempts: 0 },
      'a synced book never reached the Kobo; resending it',
    );

    // No sync yet: CWA still has its mark, so the book stays off.
    expect(await resender.check()).toMatchObject({ putBack: 0 });
    expect(phase(7)).toBe('off_shelf');

    koboSyncs(READER_A.cwaUserId, { fetch: false }); // clears the mark
    expect(await resender.check()).toMatchObject({ putBack: 1 });
    expect(await onShelf(7)).toBe(true);
    expect(phase(7)).toBe('back_on');
    expect(resender.list(reader.id)[0]).toMatchObject({ attempts: 1 });

    // Not synced yet: nothing to do.
    expect(await resender.check()).toMatchObject({ takenOff: 0, putBack: 0, delivered: 0 });
    expect(phase(7)).toBe('back_on');

    koboSyncs(READER_A.cwaUserId, { fetch: true });
    expect(await resender.check()).toMatchObject({ delivered: 1 });
    expect(phase(7)).toBeNull();
    expect(resender.list()).toEqual([]);
    expect(log.info).toHaveBeenCalledWith(
      { userId: reader.id, calibreBookId: 7, attempts: 1 },
      'a resent book reached the Kobo',
    );
  });

  it('leaves delivered books, and books still waiting for their first sync, alone', async () => {
    putOnShelf(READER_A.cwaUserId, 7);
    koboSyncs(READER_A.cwaUserId, { fetch: true });
    putOnShelf(READER_A.cwaUserId, 8);
    // A Kobo that reported a reading position has the book, download or not.
    cwa.app.exec(`insert into kobo_synced_books (user_id, book_id) values (3, 9);
      insert into kobo_reading_state (user_id, book_id) values (3, 9)`);
    clock.advance(KOBO_RESEND_GRACE_MS * 10);
    expect(await resender.check()).toEqual({
      found: 0,
      takenOff: 0,
      putBack: 0,
      delivered: 0,
      gaveUp: 0,
    });
    expect(resender.list()).toEqual([]);
  });

  it('forgets a book that arrives on its own during the grace period', async () => {
    lostInSync(7);
    await resender.check();
    cwa.app.exec('insert into downloads (user_id, book_id) values (3, 7)');
    expect(await resender.check()).toMatchObject({ delivered: 0 });
    expect(phase(7)).toBeNull();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('gives up after the last attempt and lets the reader take it off', async () => {
    lostInSync(7);
    await resender.check();
    for (let attempt = 1; attempt <= KOBO_RESEND_MAX_ATTEMPTS; attempt++) {
      clock.advance(KOBO_RESEND_GRACE_MS);
      expect(await resender.check()).toMatchObject({ takenOff: 1 });
      koboSyncs(READER_A.cwaUserId, { fetch: false });
      expect(await resender.check()).toMatchObject({ putBack: 1 });
      koboSyncs(READER_A.cwaUserId, { fetch: false }); // lost again
      expect(await resender.check()).toMatchObject({ takenOff: 0 });
      expect(phase(7)).toBe('waiting');
    }
    clock.advance(KOBO_RESEND_GRACE_MS);
    expect(await resender.check()).toMatchObject({ gaveUp: 1, takenOff: 0 });
    expect(phase(7)).toBe('given_up');
    expect(log.warn).toHaveBeenCalledWith(
      { userId: reader.id, calibreBookId: 7, attempts: KOBO_RESEND_MAX_ATTEMPTS },
      'a book still did not reach the Kobo; giving up on it',
    );
    clock.advance(KOBO_RESEND_GRACE_MS);
    expect(await resender.check()).toMatchObject({ gaveUp: 0, takenOff: 0 });
    expect(await onShelf(7)).toBe(true);

    await adapter.removeFromKoboShelf(READER_A, 7);
    await resender.check();
    expect(phase(7)).toBeNull();
  });

  it('stops when the reader takes the book off while waiting or after it was put back', async () => {
    lostInSync(7);
    lostInSync(8);
    await resender.check();
    await adapter.removeFromKoboShelf(READER_A, 7);
    await resender.check();
    expect(phase(7)).toBeNull();

    clock.advance(KOBO_RESEND_GRACE_MS);
    await resender.check();
    koboSyncs(READER_A.cwaUserId, { fetch: false });
    await resender.check();
    expect(phase(8)).toBe('back_on');
    await adapter.removeFromKoboShelf(READER_A, 8);
    await resender.check();
    expect(phase(8)).toBeNull();
  });

  it('cancel() forgets a book right away', async () => {
    lostInSync(7);
    await resender.check();
    resender.cancel(reader.id, 7);
    expect(phase(7)).toBeNull();
  });

  it('carries on when someone puts the book back on the shelf before the sync', async () => {
    lostInSync(7);
    lostInSync(8);
    await resender.check();
    clock.advance(KOBO_RESEND_GRACE_MS);
    await resender.check();
    expect([phase(7), phase(8)]).toEqual(['off_shelf', 'off_shelf']);

    // Book 7 goes back while CWA still has its mark: wait again.
    await adapter.addToKoboShelf(READER_A, 7);
    await resender.check();
    expect(phase(7)).toBe('waiting');

    // Book 8 goes back after the sync cleared the mark: the next sync sends it.
    cwa.app.exec('delete from kobo_synced_books where book_id = 8');
    await adapter.addToKoboShelf(READER_A, 8);
    await resender.check();
    expect(phase(8)).toBe('back_on');
  });

  it('waits for the next sync when CWA’s mark disappears on its own', async () => {
    lostInSync(7);
    await resender.check();
    cwa.app.exec('delete from kobo_synced_books'); // e.g. CWA's Force full sync
    await resender.check();
    expect(phase(7)).toBe('back_on');
    expect(await onShelf(7)).toBe(true);
  });

  it('checks every linked reader and keeps them apart', async () => {
    await users.create({ username: 'partner', displayName: 'Reader Two', password: PASSWORD });
    const partner = users.setCwaUserId('partner', READER_B.cwaUserId);
    await users.create({ username: 'unlinked', displayName: 'No Kobo', password: PASSWORD });
    lostInSync(7, READER_B.cwaUserId);
    putOnShelf(READER_A.cwaUserId, 7);
    koboSyncs(READER_A.cwaUserId, { fetch: true });
    expect(await resender.check()).toMatchObject({ found: 1 });
    expect(resender.list().map((r) => [r.userId, r.calibreBookId])).toEqual([[partner.id, 7]]);
    expect(resender.list(reader.id)).toEqual([]);
  });

  it('skips a reader whose Kobo is not set up, and logs real failures without stopping', async () => {
    await users.create({ username: 'noshelf', displayName: 'No Shelf', password: PASSWORD });
    users.setCwaUserId('noshelf', 6);
    lostInSync(7);
    expect(await resender.check()).toMatchObject({ found: 1 });
    expect(log.error).not.toHaveBeenCalled();

    const broken: LibraryAdapter = {
      ...adapter,
      listKoboSync: vi.fn(async ({ cwaUserId }) => {
        if (cwaUserId === 6) throw koboShelfMissing(6, 'Kobo', 'has no shelf');
        throw libraryUnavailable('CWA is down');
      }),
    } as unknown as LibraryAdapter;
    const failing = new KoboResender(database.db, clock.fn, broken, users, log);
    expect(await failing.check()).toMatchObject({ found: 0 });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: reader.id }),
      'could not check Kobo deliveries',
    );
  });

  it('runs as a job a few minutes after start, then every 10 minutes, also after a failure', async () => {
    const jobs = new KoboResendJobs(database.db, clock.fn, resender, log);
    const check = vi.spyOn(resender, 'check').mockRejectedValueOnce(new Error('disk full'));
    jobs.start();
    jobs.start();
    expect(jobs.runner.pending(KOBO_RESEND_JOB)).toHaveLength(1);

    clock.advance(KOBO_RESEND_FIRST_DELAY_MS - 1);
    expect(await jobs.runner.runDue()).toBe(0);
    clock.advance(1);
    expect(await jobs.runner.runDue()).toBe(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(jobs.runner.pending(KOBO_RESEND_JOB).map((j) => j.runAt.getTime())).toEqual([
      clock.now.getTime() + KOBO_RESEND_INTERVAL_MS,
    ]);

    clock.advance(KOBO_RESEND_INTERVAL_MS);
    expect(await jobs.runner.runDue()).toBe(1);
    expect(check).toHaveBeenCalledTimes(2);
    await jobs.stop();
  });
});
