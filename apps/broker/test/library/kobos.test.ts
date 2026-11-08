import { ItemKobos, TokenPair } from '@purrshelf/contract';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { users as usersTable } from '../../src/db/schema.js';
import { LibraryItems } from '../../src/modules/library/items.js';
import { koboState } from '../../src/modules/library/kobos.js';
import type { CwaAdapter } from '../../src/modules/library/cwa-adapter.js';
import { PASSWORD, login, makeTestApp, type TestContext } from '../helpers.js';
import { FakeCwa, READER_A, READER_B } from './fake-cwa.js';

let cwa: FakeCwa;
let adapter: CwaAdapter;
let ctx: TestContext;
let items: LibraryItems;
let token: string;
let me: string;
let partner: string;
let itemId: string;

function link(username: string, cwaUserId: number | null) {
  ctx.database.db
    .update(usersTable)
    .set({ cwaUserId })
    .where(eq(usersTable.username, username))
    .run();
}

async function call(method: 'GET' | 'PUT' | 'DELETE', path: string) {
  return ctx.app.inject({
    method,
    url: `/api/v1/library/items/${path}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

const kobosOf = async (method: 'GET' | 'PUT' | 'DELETE', path: string) => {
  const res = await call(method, path);
  expect(res.statusCode).toBe(200);
  return ItemKobos.parse(res.json()).kobos;
};

beforeEach(async () => {
  cwa = new FakeCwa();
  cwa.addBook({ id: 7, title: 'The Lighthouse Cat', authors: ['Ada Quillfeather'] });
  adapter = cwa.adapter();
  ctx = await makeTestApp({ library: adapter });
  await ctx.users.create({ username: 'partner', displayName: 'Reader Two', password: PASSWORD });
  me = ctx.users.findByUsername('reader')!.id;
  partner = ctx.users.findByUsername('partner')!.id;
  link('reader', READER_A.cwaUserId);
  link('partner', READER_B.cwaUserId);
  items = new LibraryItems(ctx.database.db, ctx.clock.fn);
  itemId = items.ensure({
    workId: 'hardcover:1',
    calibreBookId: 7,
    title: 'The Lighthouse Cat',
  }).id;
  token = TokenPair.parse((await login(ctx.app)).json()).accessToken;
});

afterEach(async () => {
  await ctx.close();
  adapter.close();
  cwa.close();
});

describe('koboState', () => {
  it.each([
    [true, true, 'on_device'],
    [true, false, 'sending'],
    [false, true, 'removing'],
    [false, false, 'not_on_device'],
  ] as const)('shelf %s, synced %s → %s', (onKoboShelf, syncedToDevice, state) => {
    expect(koboState({ onKoboShelf, syncedToDevice })).toBe(state);
  });
});

describe('Kobo endpoints', () => {
  it('lists every reader’s Kobo, mine first', async () => {
    expect(await kobosOf('GET', `${itemId}/kobos`)).toEqual([
      { userId: me, displayName: 'Reader One', me: true, state: 'not_on_device' },
      { userId: partner, displayName: 'Reader Two', me: false, state: 'not_on_device' },
    ]);
  });

  it('sorts the other readers by name', async () => {
    await ctx.users.create({
      username: 'third',
      displayName: 'Another Reader',
      password: PASSWORD,
    });
    const kobos = await kobosOf('GET', `${itemId}/kobos`);
    expect(kobos.map((k) => k.displayName)).toEqual(['Reader One', 'Another Reader', 'Reader Two']);
  });

  it('sends to my Kobo, waits for the sync, and makes me an owner', async () => {
    const kobos = await kobosOf('PUT', `${itemId}/kobos/${me}`);
    expect(kobos.map((k) => k.state)).toEqual(['sending', 'not_on_device']);
    expect(items.isOwner(itemId, me)).toBe(true);

    cwa.app.prepare('insert into kobo_synced_books (user_id, book_id) values (?, 7)').run(3);
    expect((await kobosOf('GET', `${itemId}/kobos`))[0]!.state).toBe('on_device');
  });

  it('sends to my partner’s Kobo, who becomes an owner too', async () => {
    const kobos = await kobosOf('PUT', `${itemId}/kobos/${partner}`);
    expect(kobos.map((k) => k.state)).toEqual(['not_on_device', 'sending']);
    expect(items.isOwner(itemId, partner)).toBe(true);
    expect(items.isOwner(itemId, me)).toBe(false);
  });

  it('removes from a Kobo, waiting for the sync, and keeps the owners', async () => {
    await kobosOf('PUT', `${itemId}/kobos/${me}`);
    cwa.app.prepare('insert into kobo_synced_books (user_id, book_id) values (?, 7)').run(3);
    const kobos = await kobosOf('DELETE', `${itemId}/kobos/${me}`);
    expect(kobos[0]!.state).toBe('removing');
    expect(items.isOwner(itemId, me)).toBe(true);
    cwa.app.prepare('delete from kobo_synced_books').run();
    expect((await kobosOf('GET', `${itemId}/kobos`))[0]!.state).toBe('not_on_device');
  });

  it('shows a reader without a linked or working Kobo as not set up', async () => {
    link('partner', null);
    expect((await kobosOf('GET', `${itemId}/kobos`))[1]!.state).toBe('not_set_up');
    link('partner', 6); // a CWA user without a Kobo shelf
    expect((await kobosOf('GET', `${itemId}/kobos`))[1]!.state).toBe('not_set_up');
  });

  it('refuses to send to a Kobo that is not linked', async () => {
    link('partner', null);
    const res = await call('PUT', `${itemId}/kobos/${partner}`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'KOBO_NOT_LINKED', details: { userId: partner } });
    expect(items.isOwner(itemId, partner)).toBe(false);
  });

  it('passes on CWA’s own errors, and does not make an owner when sending fails', async () => {
    link('partner', 6);
    const res = await call('PUT', `${itemId}/kobos/${partner}`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'KOBO_SHELF_MISSING' });
    expect(items.isOwner(itemId, partner)).toBe(false);
  });

  it('answers LIBRARY_UNAVAILABLE when CWA cannot be read', async () => {
    cwa.app.exec('drop table kobo_synced_books');
    const res = await call('GET', `${itemId}/kobos`);
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
  });

  it.each([
    ['an unknown book', () => `00000000-0000-4000-8000-000000000000/kobos/${me}`],
    ['an unknown reader', () => `${itemId}/kobos/nobody`],
  ])('answers NOT_FOUND for %s', async (_label, path) => {
    const res = await call('PUT', path());
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('answers NOT_FOUND when listing an unknown book', async () => {
    const res = await call('GET', '00000000-0000-4000-8000-000000000000/kobos');
    expect(res.statusCode).toBe(404);
  });

  it('rejects a malformed item id', async () => {
    const res = await call('GET', 'not-a-uuid/kobos');
    expect(res.statusCode).toBe(400);
  });

  it('needs a login', async () => {
    token = 'nope';
    expect((await call('GET', `${itemId}/kobos`)).statusCode).toBe(401);
  });
});

describe('Kobo endpoints without CWA', () => {
  it('answer LIBRARY_UNAVAILABLE, but a reader who is not linked still lists', async () => {
    const plain = await makeTestApp();
    try {
      const t = TokenPair.parse((await login(plain.app)).json()).accessToken;
      const plainItems = new LibraryItems(plain.database.db, plain.clock.fn);
      const id = plainItems.ensure({ workId: null, calibreBookId: 1, title: 'x' }).id;
      const user = plain.users.findByUsername('reader')!.id;
      const headers = { authorization: `Bearer ${t}` };
      const list = await plain.app.inject({
        method: 'GET',
        url: `/api/v1/library/items/${id}/kobos`,
        headers,
      });
      expect(list.json().kobos[0].state).toBe('not_set_up');
      plain.database.db.update(usersTable).set({ cwaUserId: 3 }).run();
      const send = await plain.app.inject({
        method: 'PUT',
        url: `/api/v1/library/items/${id}/kobos/${user}`,
        headers,
      });
      expect(send.statusCode).toBe(502);
      expect(send.json()).toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
    } finally {
      await plain.close();
    }
  });
});
