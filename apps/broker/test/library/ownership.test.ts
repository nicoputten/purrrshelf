import { ItemOwnership, TokenPair } from '@purrshelf/contract';
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
let token: string;
let me: string;
let partner: string;
let itemId: string;

const link = (cwaUserId: number | null) =>
  ctx.database.db.update(usersTable).set({ cwaUserId }).where(eq(usersTable.id, me)).run();

async function call(method: 'PUT' | 'DELETE', id = itemId) {
  return ctx.app.inject({
    method,
    url: `/api/v1/library/items/${id}/owners/me`,
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(async () => {
  cwa = new FakeCwa();
  cwa.addBook({ id: 7, title: 'The Lighthouse Cat' });
  adapter = cwa.adapter();
  ctx = await makeTestApp({ library: adapter });
  await ctx.users.create({ username: 'partner', displayName: 'Reader Two', password: PASSWORD });
  me = ctx.users.findByUsername('reader')!.id;
  partner = ctx.users.findByUsername('partner')!.id;
  link(READER_A.cwaUserId);
  items = new LibraryItems(ctx.database.db, ctx.clock.fn);
  itemId = items.ensure({ workId: null, calibreBookId: 7, title: 'The Lighthouse Cat' }).id;
  items.own(itemId, me);
  token = TokenPair.parse((await login(ctx.app)).json()).accessToken;
});

afterEach(async () => {
  await ctx.close();
  adapter.close();
  cwa.close();
});

describe('removing a book from my library', () => {
  it('takes it off my Kobo and keeps it while my partner owns it', async () => {
    items.own(itemId, partner);
    await adapter.addToKoboShelf(READER_A, 7);
    const res = await call('DELETE');
    expect(res.statusCode).toBe(200);
    expect(ItemOwnership.parse(res.json())).toEqual({
      itemId,
      owners: [{ id: partner, displayName: 'Reader Two', me: false }],
      deleteAfter: null,
    });
    expect((await adapter.getDeviceState(READER_A, 7)).onKoboShelf).toBe(false);
  });

  it('marks a book nobody owns for deletion after 7 days, and keeping it undoes that', async () => {
    const removed = (await call('DELETE')).json();
    expect(removed).toEqual({ itemId, owners: [], deleteAfter: '2026-01-08T12:00:00.000Z' });

    const kept = await call('PUT');
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toEqual({
      itemId,
      owners: [{ id: me, displayName: 'Reader One', me: true }],
      deleteAfter: null,
    });
  });

  it('works for a reader without a linked or working Kobo', async () => {
    link(6); // CWA user without a Kobo shelf
    expect((await call('DELETE')).json().owners).toEqual([]);
    await call('PUT');
    cwa.app.exec('delete from remote_auth_token');
    link(READER_A.cwaUserId);
    expect((await call('DELETE')).statusCode).toBe(200);
    await call('PUT');
    link(null);
    expect((await call('DELETE')).statusCode).toBe(200);
  });

  it('changes nothing when CWA refuses the shelf change', async () => {
    cwa.expireSessions();
    cwa.behaviour.override = (c) =>
      c.path.startsWith('/kobo/') ? new Response('nope', { status: 500 }) : undefined;
    const res = await call('DELETE');
    expect(res.statusCode).toBe(502);
    expect(items.isOwner(itemId, me)).toBe(true);
    expect(items.get(itemId)?.deleteAfter).toBeNull();
  });

  it('answers NOT_FOUND for an unknown book', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await call('DELETE', unknown)).statusCode).toBe(404);
    expect((await call('PUT', unknown)).statusCode).toBe(404);
  });
});

describe('removing without CWA', () => {
  it('only changes ownership', async () => {
    const plain = await makeTestApp();
    try {
      const t = TokenPair.parse((await login(plain.app)).json()).accessToken;
      const plainItems = new LibraryItems(plain.database.db, plain.clock.fn);
      const id = plainItems.ensure({ workId: null, calibreBookId: 1, title: 'x' }).id;
      const user = plain.users.findByUsername('reader')!;
      plainItems.own(id, user.id);
      plain.database.db.update(usersTable).set({ cwaUserId: 3 }).run();
      const res = await plain.app.inject({
        method: 'DELETE',
        url: `/api/v1/library/items/${id}/owners/me`,
        headers: { authorization: `Bearer ${t}` },
      });
      expect(res.json()).toMatchObject({ owners: [], deleteAfter: expect.any(String) });
    } finally {
      await plain.close();
    }
  });
});
