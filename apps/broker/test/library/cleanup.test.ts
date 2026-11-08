import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import {
  CLEANUP_FIRST_DELAY_MS,
  CLEANUP_INTERVAL_MS,
  CLEANUP_JOB,
  CleanupJobs,
  LibraryCleanup,
} from '../../src/modules/library/cleanup.js';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import { DELETE_GRACE_MS } from '../../src/modules/library/ownership.js';
import { PASSWORD, TestClock } from '../helpers.js';
import { FakeCwa } from './fake-cwa.js';

let cwa: FakeCwa;
let adapter: CwaAdapter;
let database: DatabaseHandle;
let clock: TestClock;
let items: LibraryItems;
let cleanup: LibraryCleanup;
const log = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  cwa = new FakeCwa();
  cwa.addBook({ id: 7, title: 'The Lighthouse Cat' });
  cwa.addBook({ id: 8, title: 'A Map of Quiet Rivers' });
  adapter = cwa.adapter();
  database = openDatabase(':memory:');
  clock = new TestClock();
  items = new LibraryItems(database.db, clock.fn);
  cleanup = new LibraryCleanup(items, adapter, log);
  log.info.mockClear();
  log.error.mockClear();
});

afterEach(() => {
  adapter.close();
  cwa.close();
  database.close();
});

async function owner() {
  return new UserRepository(database.db, clock.fn).create({
    username: 'reader',
    displayName: 'Reader One',
    password: PASSWORD,
  });
}

describe('LibraryCleanup', () => {
  it('deletes a book nobody owns once the 7 days are over, not before', async () => {
    const user = await owner();
    const cat = items.ensure({ workId: null, calibreBookId: 7, title: 'The Lighthouse Cat' });
    items.own(cat.id, user.id);
    items.disown(cat.id, user.id, DELETE_GRACE_MS);

    clock.advance(DELETE_GRACE_MS - 1);
    expect(await cleanup.sweep()).toBe(0);
    expect(await adapter.getBook(7)).not.toBeNull();

    clock.advance(1);
    expect(await cleanup.sweep()).toBe(1);
    expect(await adapter.getBook(7)).toBeNull();
    expect(items.get(cat.id)).toBeUndefined();
    expect(log.info).toHaveBeenCalledWith(
      { itemId: cat.id, title: 'The Lighthouse Cat' },
      'deleted a book nobody owns',
    );
  });

  it('keeps a book someone kept again, and books that were never marked', async () => {
    const user = await owner();
    const cat = items.ensure({ workId: null, calibreBookId: 7, title: 'x' });
    items.own(cat.id, user.id);
    items.disown(cat.id, user.id, DELETE_GRACE_MS);
    items.own(cat.id, user.id); // undo
    items.ensure({ workId: null, calibreBookId: 8, title: 'never owned' });
    clock.advance(DELETE_GRACE_MS * 2);
    expect(await cleanup.sweep()).toBe(0);
    expect(await adapter.getBook(7)).not.toBeNull();
  });

  it('forgets a book that is already gone from Calibre', async () => {
    const gone = items.ensure({ workId: null, calibreBookId: 99, title: 'gone' });
    items.disown(gone.id, 'nobody', 0);
    expect(await cleanup.sweep()).toBe(1);
    expect(items.get(gone.id)).toBeUndefined();
  });

  it('keeps the item and tries again later when CWA fails', async () => {
    const cat = items.ensure({ workId: null, calibreBookId: 7, title: 'x' });
    const map = items.ensure({ workId: null, calibreBookId: 8, title: 'y' });
    items.disown(cat.id, 'nobody', 0);
    clock.advance(1);
    items.disown(map.id, 'nobody', 0);
    cwa.behaviour.deleteAnswer = { type: 'danger', message: 'locked' };
    expect(await cleanup.sweep()).toBe(0);
    expect(items.get(cat.id)).toBeDefined();
    expect(log.error).toHaveBeenCalledTimes(2);

    delete cwa.behaviour.deleteAnswer;
    expect(await cleanup.sweep()).toBe(2);
  });

  it('runs as a job a few minutes after start, then daily, also after a failed sweep', async () => {
    const jobs = new CleanupJobs(database.db, clock.fn, cleanup, log);
    const sweep = vi.spyOn(cleanup, 'sweep').mockRejectedValueOnce(new Error('disk full'));
    jobs.start();
    jobs.start(); // a second start keeps the one pending run
    expect(jobs.runner.pending(CLEANUP_JOB)).toHaveLength(1);

    clock.advance(CLEANUP_FIRST_DELAY_MS - 1);
    expect(await jobs.runner.runDue()).toBe(0);
    clock.advance(1);
    expect(await jobs.runner.runDue()).toBe(1);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(jobs.runner.pending(CLEANUP_JOB).map((j) => j.runAt.getTime())).toEqual([
      clock.now.getTime() + CLEANUP_INTERVAL_MS,
    ]);

    clock.advance(CLEANUP_INTERVAL_MS);
    expect(await jobs.runner.runDue()).toBe(1);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(jobs.runner.pending(CLEANUP_JOB)).toHaveLength(1);
    await jobs.stop();
  });
});
