import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  BookRequest,
  Readers,
  RequestList,
  TokenPair,
  requestStatuses as contractStatuses,
} from '@purrshelf/contract';
import { ownerships, requests, requestStatuses, users } from '../src/db/schema.js';
import type { LibraryAdapter, LibraryOwner } from '../src/modules/library/types.js';
import type { LibraryItems } from '../src/modules/requests/delivery.js';
import { fakeProviders, ISBN_SALT_ROAD } from './metadata-fakes.js';
import { PASSWORD, login, makeTestApp, type TestContext } from './helpers.js';

const SALT_ROAD = 'hardcover:301';
let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

function fakeLibrary(books: Record<string, number> = {}) {
  const shelved: { owner: LibraryOwner; bookId: number }[] = [];
  const findBooks = vi.fn(async (q: { isbns?: string[] }) => {
    const isbn = q.isbns?.find((i) => books[i] !== undefined);
    return isbn === undefined ? [] : [{ id: books[isbn], isbns: [isbn], title: 'The Salt Road' }];
  });
  const library = {
    findBooks,
    addToKoboShelf: async (owner: LibraryOwner, bookId: number) => {
      shelved.push({ owner, bookId });
    },
    getDeviceState: async () => ({ onKoboShelf: false }),
    ping: async () => undefined,
  } as unknown as LibraryAdapter;
  return { library, shelved, findBooks };
}

async function setup(opts: Parameters<typeof makeTestApp>[0] = {}) {
  const fake = fakeProviders();
  ctx = await makeTestApp({
    ...opts,
    config: { HARDCOVER_API_TOKEN: 'fake-token' },
    fetch: fake.fetch,
  });
  const partner = await ctx.users.create({
    username: 'partner',
    displayName: 'Reader Two',
    password: PASSWORD,
  });
  const me = ctx.users.findByUsername('reader')!;
  const token = async (username = 'reader') =>
    TokenPair.parse((await login(ctx.app, username)).json()).accessToken;
  const auth: Record<string, string> = { authorization: `Bearer ${await token()}` };
  const post = (payload: Record<string, unknown>, headers = auth) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/requests', payload, headers });
  const get = (url: string, headers = auth) =>
    ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers });
  /** Follows a request the way the app does, until the search has settled. */
  const settled = (id: string, status: string) =>
    vi.waitFor(async () => {
      const body = BookRequest.parse((await get(`/requests/${id}`)).json());
      expect(body.status).toBe(status);
      return body;
    });
  return { me, partner, token, auth, post, get, settled };
}

function link(userId: string, cwaUserId: number) {
  ctx.database.db.update(users).set({ cwaUserId }).where(eq(users.id, userId)).run();
}

describe('the requests API', () => {
  it('needs a login', async () => {
    const { post, get } = await setup();
    expect((await post({ workId: SALT_ROAD, language: 'en', pushTo: [] }, {})).statusCode).toBe(
      401,
    );
    for (const url of ['/requests', '/requests/x', '/readers']) {
      expect((await get(url, {})).statusCode).toBe(401);
    }
  });

  it('uses the same statuses as the contract', () => {
    expect([...requestStatuses]).toEqual([...contractStatuses]);
  });
});

describe('GET /readers', () => {
  it('lists me first, and who can get books on their Kobo', async () => {
    const { get, me, partner } = await setup();
    link(partner.id, 12);
    expect(Readers.parse((await get('/readers')).json())).toEqual({
      readers: [
        { id: me.id, displayName: 'Reader One', me: true, kobo: false },
        { id: partner.id, displayName: 'Reader Two', me: false, kobo: true },
      ],
    });
  });
});

describe('POST /requests', () => {
  it('owns a library book and puts it on the chosen Kobos, without an indexer search', async () => {
    const lib = fakeLibrary({ [ISBN_SALT_ROAD]: 77 });
    const ensured: unknown[] = [];
    const items: LibraryItems = {
      ensure: (input) => {
        ensured.push(input);
        return { id: 'item-1' };
      },
      own: () => undefined,
    };
    const { post, settled, me, partner } = await setup({
      library: lib.library,
      libraryItems: items,
    });
    link(me.id, 11);
    link(partner.id, 12);
    const res = await post({
      workId: SALT_ROAD,
      language: 'en',
      pushTo: [me.id, partner.id, me.id],
    });
    expect(res.statusCode).toBe(201);
    const created = BookRequest.parse(res.json());
    expect(created).toMatchObject({
      workId: SALT_ROAD,
      title: 'The Salt Road',
      authors: ['Ilse Varenkamp'],
      language: 'en',
      mediaType: 'ebook',
      status: 'searching',
      progress: null,
      error: null,
      pushTo: [me.id, partner.id],
    });
    await settled(created.id, 'pushed');
    expect(lib.findBooks).toHaveBeenCalledWith({ isbns: [ISBN_SALT_ROAD], limit: 1 });
    expect(lib.shelved).toEqual([
      { owner: { cwaUserId: 11 }, bookId: 77 },
      { owner: { cwaUserId: 12 }, bookId: 77 },
    ]);
    expect(ensured).toEqual([
      { workId: SALT_ROAD, calibreBookId: 77, title: 'The Salt Road', mediaType: 'ebook' },
    ]);
  });

  it('records ownership in the library items by default', async () => {
    const lib = fakeLibrary({ [ISBN_SALT_ROAD]: 77 });
    const { post, settled, me } = await setup({ library: lib.library });
    const created = BookRequest.parse(
      (await post({ workId: SALT_ROAD, language: 'en', pushTo: [] })).json(),
    );
    await settled(created.id, 'in_library');
    const rows = ctx.database.db.select().from(ownerships).all();
    expect(rows).toEqual([expect.objectContaining({ userId: me.id })]);
  });

  it('answers the open request instead of searching twice', async () => {
    const { post, settled, get } = await setup();
    const first = BookRequest.parse(
      (await post({ workId: SALT_ROAD, language: 'en', pushTo: [] })).json(),
    );
    const failed = await settled(first.id, 'not_found');
    expect(failed.error).toBe('No indexer is configured');
    const again = await post({ workId: SALT_ROAD, language: 'nl', pushTo: [] });
    expect(again.statusCode).toBe(201);
    expect(BookRequest.parse(again.json()).id).toBe(first.id);
    expect(RequestList.parse((await get('/requests')).json()).requests).toHaveLength(1);
  });

  it('starts a new request once the last one is done', async () => {
    const lib = fakeLibrary({ [ISBN_SALT_ROAD]: 77 });
    const { post, settled, get, me } = await setup({ library: lib.library });
    link(me.id, 11);
    const add = async () =>
      BookRequest.parse(
        (await post({ workId: SALT_ROAD, language: 'en', pushTo: [me.id] })).json(),
      );
    const first = await add();
    await settled(first.id, 'pushed');
    ctx.clock.advance(1000);
    const second = await add();
    expect(second.id).not.toBe(first.id);
    await settled(second.id, 'pushed');
    const list = RequestList.parse((await get('/requests')).json()).requests;
    expect(list.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it('lists my requests newest first', async () => {
    const { post, settled, get } = await setup();
    const a = BookRequest.parse(
      (await post({ workId: SALT_ROAD, language: 'en', pushTo: [] })).json(),
    );
    await settled(a.id, 'not_found');
    ctx.clock.advance(1000);
    const b = BookRequest.parse(
      (await post({ workId: 'openlibrary:OL202W', language: 'nl', pushTo: [] })).json(),
    );
    await settled(b.id, 'not_found');
    const list = RequestList.parse((await get('/requests')).json()).requests;
    expect(list.map((r) => [r.id, r.title, r.language])).toEqual([
      [b.id, 'Pride and Prejudice', 'nl'],
      [a.id, 'The Salt Road', 'en'],
    ]);
  });

  it("searches with the work's place in its series, so another volume is never taken", async () => {
    const { post, settled } = await setup();
    const inSeries = BookRequest.parse(
      (await post({ workId: SALT_ROAD, language: 'en', pushTo: [] })).json(),
    );
    const single = BookRequest.parse(
      (await post({ workId: 'openlibrary:OL202W', language: 'en', pushTo: [] })).json(),
    );
    await settled(inSeries.id, 'not_found');
    await settled(single.id, 'not_found');
    const query = (id: string) =>
      JSON.parse(
        ctx.database.db.select().from(requests).where(eq(requests.id, id)).get()!.queryJson,
      ) as { series?: unknown };
    expect(query(inSeries.id).series).toEqual({ name: 'Lantern Keepers', position: 1 });
    expect(query(single.id).series).toBeUndefined();
  });

  it('refuses an unknown reader or a bad body', async () => {
    const { post } = await setup();
    const res = await post({ workId: SALT_ROAD, language: 'en', pushTo: ['nobody'] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR', details: { pushTo: ['nobody'] } });
    expect((await post({ workId: 'nope', language: 'en', pushTo: [] })).statusCode).toBe(400);
    expect((await post({ workId: SALT_ROAD, language: 'de', pushTo: [] })).statusCode).toBe(400);
  });

  it('logs a request that fails after the add answered', async () => {
    const lib = fakeLibrary({ [ISBN_SALT_ROAD]: 77 });
    const items: LibraryItems = {
      ensure: () => Promise.reject(new Error('database is locked')),
      own: () => undefined,
    };
    const { post, get } = await setup({ library: lib.library, libraryItems: items });
    const errors = vi.spyOn(ctx.app.log, 'error');
    const created = BookRequest.parse(
      (await post({ workId: SALT_ROAD, language: 'en', pushTo: [] })).json(),
    );
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(errors.mock.calls[0]?.[1]).toBe('request failed after it was answered');
    expect(BookRequest.parse((await get(`/requests/${created.id}`)).json()).status).toBe(
      'in_library',
    );
  });
});

describe('GET /requests/:id', () => {
  it("does not show someone else's request", async () => {
    const { post, get, token, settled } = await setup();
    const mine = BookRequest.parse(
      (await post({ workId: SALT_ROAD, language: 'en', pushTo: [] })).json(),
    );
    await settled(mine.id, 'not_found');
    const partner = { authorization: `Bearer ${await token('partner')}` };
    expect((await get(`/requests/${mine.id}`, partner)).json()).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await get('/requests/unknown')).statusCode).toBe(404);
    expect(RequestList.parse((await get('/requests', partner)).json()).requests).toEqual([]);
  });
});
