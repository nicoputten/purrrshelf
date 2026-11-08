import { LibraryBooks, TokenPair } from '@purrshelf/contract';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { users as usersTable } from '../../src/db/schema.js';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import { PASSWORD, login, makeTestApp, type TestContext } from '../helpers.js';
import { FakeCwa, READER_A } from './fake-cwa.js';

let cwa: FakeCwa;
let adapter: CwaAdapter;
let ctx: TestContext;
let items: LibraryItems;
let me: string;
let partner: string;

async function books(c = ctx) {
  const token = TokenPair.parse((await login(c.app)).json()).accessToken;
  const res = await c.app.inject({
    method: 'GET',
    url: '/api/v1/library/books',
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.statusCode, body: res.json() };
}

beforeEach(async () => {
  cwa = new FakeCwa();
  cwa.addBook({
    id: 10,
    title: 'The Lighthouse Cat',
    authors: ['Ada Quillfeather'],
    series: { name: 'Harbour Tales', index: 1 },
  });
  cwa.addBook({ id: 11, title: 'A Map of Quiet Rivers', authors: ['Bram Inkwell'] });
  cwa.app.exec(`
    insert into book_read_link (book_id, user_id, read_status, last_modified) values (10, 3, 2, '2026-03-01 10:00:00');
    insert into kobo_reading_state (id, user_id, book_id, last_modified) values (1, 3, 10, '2026-03-02 21:30:00');
    insert into kobo_bookmark (kobo_reading_state_id, progress_percent) values (1, 42.5);
  `);
  adapter = cwa.adapter();
  ctx = await makeTestApp({ library: adapter });
  await ctx.users.create({ username: 'partner', displayName: 'Reader Two', password: PASSWORD });
  me = ctx.users.findByUsername('reader')!.id;
  partner = ctx.users.findByUsername('partner')!.id;
  ctx.database.db
    .update(usersTable)
    .set({ cwaUserId: READER_A.cwaUserId })
    .where(eq(usersTable.id, me))
    .run();
  items = new LibraryItems(ctx.database.db, ctx.clock.fn);
});

afterEach(async () => {
  await ctx.close();
  adapter.close();
  cwa.close();
});

describe('GET /library/books', () => {
  it('lists every book, newest first, with owners, my Kobo and my progress', async () => {
    const cat = items.ensure({ workId: 'hardcover:1', calibreBookId: 10, title: 'x' });
    items.own(cat.id, me);
    items.own(cat.id, partner);
    ctx.clock.advance(60_000);
    const map = items.ensure({ workId: null, calibreBookId: 11, title: 'x' });
    items.own(map.id, partner);
    ctx.clock.advance(60_000);
    const gone = items.ensure({ workId: null, calibreBookId: 99, title: 'Deleted in Calibre' });
    await adapter.addToKoboShelf(READER_A, 10);

    const { status, body } = await books();
    expect(status).toBe(200);
    expect(LibraryBooks.parse(body).books).toEqual([
      {
        itemId: gone.id,
        workId: null,
        mediaType: 'ebook',
        title: 'Deleted in Calibre',
        authors: [],
        series: null,
        addedAt: '2026-01-01T12:02:00.000Z',
        owners: [],
        onMyKobo: false,
        reading: { status: 'unread', progressPercent: null },
      },
      {
        itemId: map.id,
        workId: null,
        mediaType: 'ebook',
        title: 'A Map of Quiet Rivers',
        authors: ['Bram Inkwell'],
        series: null,
        addedAt: '2026-01-01T12:01:00.000Z',
        owners: [{ id: partner, displayName: 'Reader Two', me: false }],
        onMyKobo: false,
        reading: { status: 'unread', progressPercent: null },
      },
      {
        itemId: cat.id,
        workId: 'hardcover:1',
        mediaType: 'ebook',
        title: 'The Lighthouse Cat',
        authors: ['Ada Quillfeather'],
        series: { name: 'Harbour Tales', position: 1 },
        addedAt: '2026-01-01T12:00:00.000Z',
        owners: [
          { id: me, displayName: 'Reader One', me: true },
          { id: partner, displayName: 'Reader Two', me: false },
        ],
        onMyKobo: true,
        reading: { status: 'reading', progressPercent: 42.5 },
      },
    ]);
  });

  it('has no Kobo or progress for a reader whose Kobo is not linked or set up', async () => {
    items.ensure({ workId: null, calibreBookId: 10, title: 'x' });
    ctx.database.db.update(usersTable).set({ cwaUserId: 6 }).run(); // no Kobo shelf
    expect((await books()).body.books[0]).toMatchObject({
      onMyKobo: false,
      reading: { status: 'unread' },
    });
    ctx.database.db.update(usersTable).set({ cwaUserId: null }).run();
    expect((await books()).body.books[0]).toMatchObject({ onMyKobo: false, reading: null });
  });

  it('is empty for an empty library', async () => {
    expect((await books()).body).toEqual({ books: [] });
  });

  it('answers LIBRARY_UNAVAILABLE when Calibre cannot be read', async () => {
    items.ensure({ workId: null, calibreBookId: 10, title: 'x' });
    cwa.metadata.exec('drop table books');
    const { status, body } = await books();
    expect(status).toBe(502);
    expect(body).toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
  });

  it('lists the broker’s own records when CWA is not configured', async () => {
    const plain = await makeTestApp();
    try {
      plain.database.db.update(usersTable).set({ cwaUserId: 3 }).run();
      new LibraryItems(plain.database.db, plain.clock.fn).ensure({
        workId: null,
        calibreBookId: 1,
        title: 'Kept title',
      });
      expect((await books(plain)).body.books).toEqual([
        expect.objectContaining({
          title: 'Kept title',
          authors: [],
          onMyKobo: false,
          reading: null,
        }),
      ]);
    } finally {
      await plain.close();
    }
  });

  it('asks Calibre in batches of 500', async () => {
    for (let id = 1000; id < 1501; id++) {
      items.ensure({ workId: null, calibreBookId: id, title: `Book ${id}` });
    }
    ctx.database.db.update(usersTable).set({ cwaUserId: null }).run();
    expect((await books()).body.books).toHaveLength(501);
  });
});
