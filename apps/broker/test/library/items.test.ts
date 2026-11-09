import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import { libraryItems } from '../../src/db/schema.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import { PASSWORD, TestClock } from '../helpers.js';

let database: DatabaseHandle;
let clock: TestClock;
let items: LibraryItems;
let users: UserRepository;

beforeEach(() => {
  database = openDatabase(':memory:');
  clock = new TestClock();
  items = new LibraryItems(database.db, clock.fn);
  users = new UserRepository(database.db, clock.fn);
});
afterEach(() => database.close());

describe('LibraryItems', () => {
  it('creates one item per Calibre book and fills in a missing work id', () => {
    const first = items.ensure({ workId: null, calibreBookId: 7, title: 'The Lighthouse Cat' });
    expect(first).toMatchObject({ workId: null, mediaType: 'ebook', deleteAfter: null });
    const second = items.ensure({ workId: 'hardcover:1', calibreBookId: 7, title: 'x' });
    expect(second).toEqual({ ...first, workId: 'hardcover:1' });
    expect(items.ensure({ workId: 'hardcover:2', calibreBookId: 7, title: 'x' })).toEqual(second);
    expect(items.get(first.id)).toEqual(second);
    expect(items.byWorkIds(['hardcover:1']).map((i) => i.id)).toEqual([first.id]);
    expect(items.byWorkIds([])).toEqual([]);
  });

  it('keeps owners per user, oldest first, and owning cancels a pending deletion', async () => {
    const a = await users.create({ username: 'a', displayName: 'Reader One', password: PASSWORD });
    const b = await users.create({ username: 'b', displayName: 'Reader Two', password: PASSWORD });
    const item = items.ensure({ workId: null, calibreBookId: 7, title: 'x' });
    database.db
      .update(libraryItems)
      .set({ deleteAfter: new Date(1) })
      .run();

    items.own(item.id, b.id);
    clock.advance(1000);
    items.own(item.id, a.id);
    items.own(item.id, a.id); // idempotent
    expect(items.get(item.id)?.deleteAfter).toBeNull();
    expect(items.owners([item.id, 'other']).get(item.id)).toEqual([
      { userId: b.id, displayName: 'Reader Two' },
      { userId: a.id, displayName: 'Reader One' },
    ]);
    expect(items.owners([])).toEqual(new Map());
    expect(items.isOwner(item.id, a.id)).toBe(true);
    expect(items.isOwner('other', a.id)).toBe(false);
  });

  it('lists what one reader owns, newest first', async () => {
    const a = await users.create({ username: 'a', displayName: 'Reader One', password: PASSWORD });
    const b = await users.create({ username: 'b', displayName: 'Reader Two', password: PASSWORD });
    const first = items.ensure({ workId: null, calibreBookId: 7, title: 'B' });
    const second = items.ensure({ workId: null, calibreBookId: 8, title: 'A' });
    const third = items.ensure({ workId: null, calibreBookId: 9, title: 'C' });
    items.own(first.id, a.id);
    clock.advance(1000);
    items.own(second.id, a.id);
    items.own(third.id, a.id);
    items.own(third.id, b.id);
    expect(items.ownedBy(a.id).map((o) => [o.item.title, o.ownedAt.getTime()])).toEqual([
      ['A', clock.now.getTime()],
      ['C', clock.now.getTime()],
      ['B', clock.now.getTime() - 1000],
    ]);
    expect(items.ownedBy(b.id).map((o) => o.item.id)).toEqual([third.id]);
    expect(items.ownedBy('nobody')).toEqual([]);
  });
});
