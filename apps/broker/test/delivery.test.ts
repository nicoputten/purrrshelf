import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema.js';
import { UserRepository } from '../src/modules/auth/users.js';
import type { LibraryOwner } from '../src/modules/library/types.js';
import {
  noLibraryItems,
  type KoboShelves,
  type LibraryItems,
} from '../src/modules/requests/delivery.js';
import { PASSWORD } from './helpers.js';
import { QUERY, indexerInput, makeHarness, type Harness } from './downloads-harness.js';

class FakeShelves implements KoboShelves {
  added: { cwaUserId: number; bookId: number }[] = [];
  failFor = new Set<number>();
  async addToKoboShelf(owner: LibraryOwner, bookId: number) {
    if (this.failFor.has(owner.cwaUserId)) throw new Error('no shelf named "Kobo"');
    this.added.push({ cwaUserId: owner.cwaUserId, bookId });
  }
}

class FakeItems implements LibraryItems {
  ensured: unknown[] = [];
  owned: [string, string][] = [];
  async ensure(input: Parameters<LibraryItems['ensure']>[0]) {
    this.ensured.push(input);
    return { id: `item-${input.calibreBookId}` };
  }
  own(itemId: string, userId: string) {
    this.owned.push([itemId, userId]);
  }
}

let h: Harness;
let shelves: FakeShelves;
let items: FakeItems;
let partnerId: string;

function link(userId: string, cwaUserId: number) {
  h.database.db.update(users).set({ cwaUserId }).where(eq(users.id, userId)).run();
}

beforeEach(async () => {
  shelves = new FakeShelves();
  items = new FakeItems();
  h = await makeHarness({ shelves, libraryItems: items });
  h.indexers.upsert(indexerInput());
  h.library.books.set(QUERY.title, 77);
  const partner = await new UserRepository(h.database.db, h.clock.fn).create({
    username: 'partner',
    displayName: 'Reader Two',
    password: PASSWORD,
  });
  partnerId = partner.id;
  link(h.userId, 11);
});

function add(pushTo: string[]) {
  return h.requests.add({ userId: h.userId, workId: 'hardcover:1', query: QUERY, pushTo });
}

describe('a book that is already in the library', () => {
  it('records ownership and puts it on every chosen Kobo, without an indexer call', async () => {
    link(partnerId, 12);
    const req = await add([h.userId, partnerId]);
    expect(req).toMatchObject({ status: 'pushed', calibreBookId: 77, error: null });
    expect(items.ensured).toEqual([
      { workId: 'hardcover:1', calibreBookId: 77, title: QUERY.title, mediaType: 'ebook' },
    ]);
    expect(items.owned).toEqual([['item-77', h.userId]]);
    expect(shelves.added).toEqual([
      { cwaUserId: 11, bookId: 77 },
      { cwaUserId: 12, bookId: 77 },
    ]);
    expect(h.calls()).toBe(0);
  });

  it('only owns it when no Kobo was chosen', async () => {
    const req = await add([]);
    expect(req).toMatchObject({ status: 'in_library', error: null });
    expect(items.owned).toHaveLength(1);
    expect(shelves.added).toEqual([]);
  });

  it('stays in the library with a clear reason when a Kobo cannot be reached', async () => {
    shelves.failFor.add(11);
    const req = await add([h.userId, partnerId]);
    expect(req.status).toBe('in_library');
    expect(req.error).toBe(
      'Reader One\'s Kobo: no shelf named "Kobo"; Reader Two is not linked to a CWA account',
    );
    expect(items.owned).toHaveLength(1);
  });

  it('names a reader that no longer exists', async () => {
    const req = await add(['gone']);
    expect(req.error).toBe('Reader gone no longer exists');
  });
});

describe('without a library', () => {
  it('cannot push yet, and records no ownership by default', async () => {
    h = await makeHarness();
    h.indexers.upsert(indexerInput());
    h.library.books.set(QUERY.title, 77);
    link(h.userId, 11);
    const req = await add([h.userId]);
    expect(req).toMatchObject({ status: 'in_library', error: 'The library is not set up yet' });
    expect(
      await noLibraryItems.ensure({
        workId: 'x',
        calibreBookId: 1,
        title: 't',
        mediaType: 'ebook',
      }),
    ).toEqual({ id: '' });
    expect(noLibraryItems.own('', '')).toBeUndefined();
  });
});

describe('deliver', () => {
  it('leaves a request alone that is not in the library', async () => {
    h.library.books.clear();
    const req = await add([h.userId]);
    expect(req.status).not.toBe('in_library');
    expect(await h.delivery.deliver(req)).toBe(req);
    expect(items.ensured).toEqual([]);
  });
});
