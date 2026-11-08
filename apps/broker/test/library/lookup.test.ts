import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../../src/db/index.js';
import type { User } from '../../src/db/schema.js';
import { UserRepository } from '../../src/modules/auth/users.js';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import { ItemLibraryLookup } from '../../src/modules/library/lookup.js';
import { PASSWORD, TestClock } from '../helpers.js';
import { FakeCwa, READER_A } from './fake-cwa.js';

let cwa: FakeCwa;
let adapter: CwaAdapter;
let database: DatabaseHandle;
let items: LibraryItems;
let lookup: ItemLibraryLookup;
let reader: User;
let partner: User;

const candidate = (key: string, isbns: string[] = []) => ({
  key,
  isbns,
  title: 'any',
  authors: [],
});

beforeEach(async () => {
  cwa = new FakeCwa();
  cwa.addBook({
    id: 7,
    title: 'The Lighthouse Cat',
    identifiers: [{ type: 'isbn', val: '979-8-00-000001-4' }],
  });
  cwa.addBook({ id: 8, title: 'A Map of Quiet Rivers' });
  adapter = cwa.adapter();
  database = openDatabase(':memory:');
  const clock = new TestClock();
  const users = new UserRepository(database.db, clock.fn);
  reader = await users.create({ username: 'a', displayName: 'Reader One', password: PASSWORD });
  partner = await users.create({ username: 'b', displayName: 'Reader Two', password: PASSWORD });
  users.setCwaUserId('a', READER_A.cwaUserId);
  items = new LibraryItems(database.db, clock.fn);
  lookup = new ItemLibraryLookup(items, adapter, (id) => users.findById(id));
});

afterEach(() => {
  adapter.close();
  cwa.close();
  database.close();
});

describe('ItemLibraryLookup', () => {
  it('matches by work id, with owners and my Kobo', async () => {
    const item = items.ensure({ workId: 'hardcover:1', calibreBookId: 8, title: 'x' });
    items.own(item.id, partner.id);
    await adapter.addToKoboShelf(READER_A, 8);
    const result = await lookup.match(reader.id, [candidate('hardcover:1'), candidate('x:2')]);
    expect([...result.keys()]).toEqual(['hardcover:1']);
    expect(result.get('hardcover:1')).toEqual({
      itemId: item.id,
      owners: [{ id: partner.id, displayName: 'Reader Two', me: false }],
      onMyKobo: true,
      reading: { status: 'unread', progressPercent: null },
    });
  });

  it('adds my reading progress from the Kobo sync data', async () => {
    items.ensure({ workId: 'hardcover:1', calibreBookId: 8, title: 'x' });
    cwa.app.exec(`
      insert into book_read_link (book_id, user_id, read_status, last_modified) values (8, 3, 2, '2026-03-01 10:00:00');
      insert into kobo_reading_state (id, user_id, book_id, last_modified) values (1, 3, 8, '2026-03-02 21:30:00');
      insert into kobo_bookmark (kobo_reading_state_id, progress_percent) values (1, 42.5);
    `);
    const result = await lookup.match(reader.id, [candidate('hardcover:1')]);
    expect(result.get('hardcover:1')?.reading).toEqual({
      status: 'reading',
      progressPercent: 42.5,
    });
    cwa.app.exec('drop table kobo_bookmark');
    expect(
      (await lookup.match(reader.id, [candidate('hardcover:1')])).get('hardcover:1')?.reading,
    ).toBeNull();
  });

  it('uses one item when two Calibre books share a work id', async () => {
    const first = items.ensure({ workId: 'hardcover:1', calibreBookId: 7, title: 'x' });
    items.ensure({ workId: 'hardcover:1', calibreBookId: 8, title: 'x' });
    const result = await lookup.match(reader.id, [candidate('hardcover:1')]);
    expect(result.get('hardcover:1')?.itemId).toBe(first.id);
  });

  it('matches a Calibre book by ISBN and remembers the work id', async () => {
    const result = await lookup.match(reader.id, [
      candidate('hardcover:3', ['9798000000014']),
      candidate('hardcover:4', ['9798000000021']),
    ]);
    const item = items.byCalibreId(7)!;
    expect(item.workId).toBe('hardcover:3');
    expect([...result.entries()]).toEqual([
      ['hardcover:3', { itemId: item.id, owners: [], onMyKobo: false, reading: expect.anything() }],
    ]);
  });

  it('shows nothing on the Kobo of a reader who is not linked or has no shelf', async () => {
    const item = items.ensure({ workId: 'hardcover:1', calibreBookId: 8, title: 'x' });
    items.own(item.id, partner.id);
    const result = await lookup.match(partner.id, [candidate('hardcover:1')]);
    expect(result.get('hardcover:1')).toMatchObject({
      owners: [{ id: partner.id, me: true }],
      onMyKobo: false,
      reading: null,
    });
    cwa.app.exec("delete from shelf where name = 'Kobo'");
    expect(
      (await lookup.match(reader.id, [candidate('hardcover:1')])).get('hardcover:1'),
    ).toMatchObject({ onMyKobo: false });
  });

  it('keeps search working while the library cannot be read', async () => {
    cwa.metadata.exec('drop table identifiers');
    expect(await lookup.match(reader.id, [candidate('hardcover:3', ['9798000000014'])])).toEqual(
      new Map(),
    );
  });

  it('asks Calibre nothing without ISBNs', async () => {
    expect(await lookup.match(reader.id, [candidate('hardcover:9', ['--'])])).toEqual(new Map());
  });
});
