import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import { users as usersTable } from '../../src/db/schema.js';
import { AppError } from '../../src/errors.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import { BookDiscard } from '../../src/modules/library/discard.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import type { LibraryAdapter, LibraryOwner } from '../../src/modules/library/types.js';
import { PASSWORD, TestClock } from '../helpers.js';

/** Just the two calls a discard makes, with failures to switch on. */
class FakeLibrary {
  shelfRemovals: [number, number][] = [];
  deleted: number[] = [];
  shelfError: Map<number, AppError | Error> = new Map();
  deleteError: AppError | Error | null = null;
  async removeFromKoboShelf(owner: LibraryOwner, bookId: number) {
    const err = this.shelfError.get(owner.cwaUserId);
    if (err) throw err;
    this.shelfRemovals.push([owner.cwaUserId, bookId]);
  }
  async deleteBook(bookId: number) {
    if (this.deleteError) throw this.deleteError;
    this.deleted.push(bookId);
  }
  asAdapter(): LibraryAdapter {
    return this as unknown as LibraryAdapter;
  }
}

let database: DatabaseHandle;
let clock: TestClock;
let items: LibraryItems;
let users: UserRepository;
let lib: FakeLibrary;
let discard: BookDiscard;
let me: string;
let partner: string;
let unlinked: string;

const link = (id: string, cwaUserId: number | null) =>
  database.db.update(usersTable).set({ cwaUserId }).where(eq(usersTable.id, id)).run();

beforeEach(async () => {
  database = openDatabase(':memory:');
  clock = new TestClock();
  items = new LibraryItems(database.db, clock.fn);
  users = new UserRepository(database.db, clock.fn);
  me = (await users.create({ username: 'reader', displayName: 'Reader One', password: PASSWORD }))
    .id;
  partner = (
    await users.create({ username: 'partner', displayName: 'Reader Two', password: PASSWORD })
  ).id;
  unlinked = (
    await users.create({ username: 'third', displayName: 'Reader Three', password: PASSWORD })
  ).id;
  link(me, 3);
  link(partner, 4);
  lib = new FakeLibrary();
  discard = new BookDiscard(items, lib.asAdapter(), (id) => users.findById(id));
});

describe('discarding a book the request imported', () => {
  it('takes it off every Kobo, deletes it and forgets the item', async () => {
    const item = items.ensure({ workId: 'w:1', calibreBookId: 9, title: 'Wrong' });
    items.own(item.id, me);
    await discard.discard(9, [me, partner, unlinked]);
    expect(lib.shelfRemovals).toEqual([
      [3, 9],
      [4, 9],
    ]);
    expect(lib.deleted).toEqual([9]);
    expect(items.byCalibreId(9)).toBeUndefined();
  });

  it('also reaches an owner who was not a reader of the request', async () => {
    const item = items.ensure({ workId: 'w:1', calibreBookId: 9, title: 'Wrong' });
    items.own(item.id, partner);
    await discard.discard(9, [me]);
    expect(lib.shelfRemovals.map(([u]) => u).sort()).toEqual([3, 4]);
  });

  it('skips a reader without a Kobo shelf, and a book already gone from Calibre', async () => {
    lib.shelfError.set(3, new AppError(409, 'KOBO_SHELF_MISSING', 'no shelf'));
    lib.shelfError.set(4, new AppError(409, 'KOBO_SYNC_NOT_SET_UP', 'no sync'));
    lib.deleteError = new AppError(404, 'NOT_FOUND', 'gone');
    await discard.discard(9, [me, partner]);
    expect(lib.deleted).toEqual([]);
  });

  it('changes nothing in the library when CWA refuses the Kobo step', async () => {
    const item = items.ensure({ workId: 'w:1', calibreBookId: 9, title: 'Wrong' });
    items.own(item.id, me);
    lib.shelfError.set(3, new Error('CWA is down'));
    await expect(discard.discard(9, [me])).rejects.toThrow('CWA is down');
    expect(lib.deleted).toEqual([]);
    expect(items.byCalibreId(9)).toBeDefined();
  });

  it('keeps the item when the delete fails', async () => {
    items.ensure({ workId: 'w:1', calibreBookId: 9, title: 'Wrong' });
    lib.deleteError = new AppError(502, 'LIBRARY_UNAVAILABLE', 'down');
    await expect(discard.discard(9, [me])).rejects.toThrow('down');
    expect(items.byCalibreId(9)).toBeDefined();
  });
});

describe('dropping a book that was already in the library', () => {
  it('only leaves my library and the Kobos of readers who do not own it', async () => {
    const item = items.ensure({ workId: 'w:1', calibreBookId: 9, title: 'Shared' });
    items.own(item.id, me);
    items.own(item.id, partner);
    await discard.dropFor(9, me, [me, partner]);
    expect(lib.shelfRemovals).toEqual([[3, 9]]);
    expect(lib.deleted).toEqual([]);
    expect(items.isOwner(item.id, me)).toBe(false);
    expect(items.isOwner(item.id, partner)).toBe(true);
  });

  it('marks a book nobody owns any more for the daily cleanup', async () => {
    const item = items.ensure({ workId: 'w:1', calibreBookId: 9, title: 'Mine only' });
    items.own(item.id, me);
    await discard.dropFor(9, me, [me]);
    expect(items.get(item.id)?.deleteAfter).not.toBeNull();
  });

  it('handles an item nobody owns', async () => {
    const item = items.ensure({ workId: 'w:1', calibreBookId: 9, title: 'Orphan' });
    await discard.dropFor(9, me, [me]);
    expect(lib.shelfRemovals).toEqual([[3, 9]]);
    expect(items.get(item.id)).toBeDefined();
  });

  it('still clears the Kobo when the broker has no item for the book', async () => {
    await discard.dropFor(9, me, [me]);
    expect(lib.shelfRemovals).toEqual([[3, 9]]);
  });
});

describe('without a library', () => {
  it('says the library is not set up', async () => {
    const none = new BookDiscard(items, null, (id) => users.findById(id));
    await expect(none.discard(9, [me])).rejects.toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
    await expect(none.dropFor(9, me, [me])).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
    });
  });
});
