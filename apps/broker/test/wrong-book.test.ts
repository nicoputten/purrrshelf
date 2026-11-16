import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookRequest, ReleaseList } from '@purrshelf/contract';
import { and, eq } from 'drizzle-orm';
import { registerErrorHandling } from '../src/errors.js';
import { releases, requests } from '../src/db/schema.js';
import type { PreHandler } from '../src/modules/auth/authenticate.js';
import type { WrongBookLibrary } from '../src/modules/requests/service.js';
import { requestRoutes } from '../src/modules/requests/routes.js';
import { requestSearches, requestView } from '../src/modules/requests/view.js';
import type { ImportLibrary } from '../src/modules/releases/pipeline.js';
import type { DownloadClient, DownloadState } from '../src/modules/sabnzbd/client.js';
import { fixture } from './fake-newznab.js';
import { QUERY, fakeFor, indexerInput, makeHarness, type Harness } from './downloads-harness.js';

const HOST = 'indexer.example.invalid';
const WORK = 'hardcover:301';
const BOOK = 9;

class FakeSab implements DownloadClient {
  added: string[] = [];
  async add(_nzb: Buffer, name: string) {
    this.added.push(name);
    return `nzo_${this.added.length}`;
  }
  async status(): Promise<DownloadState> {
    return { state: 'downloading', percentage: 10 };
  }
  async remove() {}
  async ping() {}
}

class FakeWrongBookLibrary implements WrongBookLibrary {
  discarded: [number, string[]][] = [];
  dropped: [number, string, string[]][] = [];
  fail: Error | null = null;
  async discard(calibreBookId: number, readers: string[]) {
    if (this.fail) throw this.fail;
    this.discarded.push([calibreBookId, readers]);
  }
  async dropFor(calibreBookId: number, userId: string, readers: string[]) {
    if (this.fail) throw this.fail;
    this.dropped.push([calibreBookId, userId, readers]);
  }
}

const noBooks: ImportLibrary = { findBooks: async () => [] };

let h: Harness;
let sab: FakeSab;
let lib: FakeWrongBookLibrary;
let app: FastifyInstance;
let root: string;

const fakeAuth: PreHandler = async (request) => {
  request.userId = (request.headers['x-user'] as string | undefined) ?? h.userId;
};

async function build(withLibrary = true) {
  root = await mkdtemp(join(tmpdir(), 'purrshelf-wrong-'));
  await mkdir(join(root, 'downloads'));
  await mkdir(join(root, 'ingest'));
  sab = new FakeSab();
  lib = new FakeWrongBookLibrary();
  h = await makeHarness({
    sab,
    importLibrary: noBooks,
    settings: { downloadsPath: join(root, 'downloads'), ingestPath: join(root, 'ingest') },
    wrongBook: withLibrary ? lib : null,
  });
  h.indexers.upsert(indexerInput());
  fakeFor(h, HOST)
    .on('search', { body: fixture('search-hit.xml') })
    .on('get', { body: fixture('release.nzb') });
  app = Fastify({ forceCloseConnections: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);
  await app.register(requestRoutes, {
    prefix: '/api/v1',
    requests: h.requests,
    releases: h.pipeline,
    events: h.events,
    view: (row) => requestView(h.database.db, row),
    searches: (row) => requestSearches(h.database.db, row),
    works: { getWork: async () => ({ title: QUERY.title, authors: QUERY.authors, isbns: [] }) },
    readerIds: () => [h.userId],
    requireAuth: fakeAuth,
    log: app.log,
  });
}

afterEach(async () => {
  await app?.close();
  await rm(root, { recursive: true, force: true });
});

const call = (method: 'GET' | 'POST', url: string, payload?: object, user?: string) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: user ? { 'x-user': user } : {},
    ...(payload ? { payload } : {}),
  });

const wrong = (id: string, then: string, user?: string) =>
  call('POST', `/requests/${id}/wrong-book`, { then }, user);

/** A request that grabbed, imported and pushed a book (to me and `pushTo`). */
async function delivered(pushTo: string[] = []): Promise<string> {
  const req = await h.requests.add({ userId: h.userId, workId: WORK, query: QUERY, pushTo });
  expect(req.status).toBe('downloading');
  h.database.db
    .update(requests)
    .set({ status: 'pushed', calibreBookId: BOOK, downloadId: null, progress: null })
    .where(eq(requests.id, req.id))
    .run();
  return req.id;
}

const grabbed = (id: string) =>
  h.database.db
    .select()
    .from(releases)
    .where(and(eq(releases.requestId, id), eq(releases.status, 'grabbed')))
    .all();

describe('POST /requests/:id/wrong-book', () => {
  it('deletes a book this request imported, never picks it again, and lets me search', async () => {
    await build();
    const partner = randomUUID();
    const id = await delivered([partner]);
    const res = await wrong(id, 'search_myself');
    expect(res.statusCode).toBe(200);
    expect(BookRequest.parse(res.json())).toMatchObject({ status: 'choose_release', error: null });
    expect(lib.discarded).toEqual([[BOOK, [h.userId, partner]]]);
    expect(lib.dropped).toEqual([]);
    expect(grabbed(id)).toEqual([]);
    const row = h.requests.get(id);
    expect(row.calibreBookId).toBeNull();
    const list = ReleaseList.parse((await call('GET', `/requests/${id}/releases`)).json());
    const old = list.releases.find((r) => r.title.startsWith('Ada Quill'))!;
    expect(old.rejected).toEqual(['failed_before']);
  });

  it('searches again without taking the library for an answer', async () => {
    await build();
    const id = await delivered();
    // The library still knows a book by this title; the new round must not stop there.
    h.library.books.set(QUERY.title, BOOK);
    const before = h.calls();
    const res = await wrong(id, 'search_again');
    expect(BookRequest.parse(res.json()).status).toBe('searching');
    // The only acceptable release is the one that was wrong, so the reader gets the list.
    await vi.waitFor(() => expect(h.requests.get(id).status).toBe('choose_release'));
    expect(h.calls()).toBeGreaterThan(before);
    expect(sab.added).toHaveLength(1);
  });

  it('just removes it when asked', async () => {
    await build();
    const id = await delivered();
    const res = await wrong(id, 'remove_only');
    expect(BookRequest.parse(res.json()).status).toBe('cancelled');
    expect(lib.discarded).toHaveLength(1);
  });

  it('only drops a book that was in the library before the request', async () => {
    await build();
    h.library.books.set(QUERY.title, BOOK);
    const req = await h.requests.add({ userId: h.userId, workId: WORK, query: QUERY, pushTo: [] });
    expect(req.status).toBe('in_library');
    const res = await wrong(req.id, 'search_myself');
    expect(BookRequest.parse(res.json()).status).toBe('choose_release');
    expect(lib.discarded).toEqual([]);
    expect(lib.dropped).toEqual([[BOOK, h.userId, [h.userId]]]);
  });

  it('changes nothing when the library refuses', async () => {
    await build();
    const id = await delivered();
    lib.fail = new Error('CWA is down');
    const res = await wrong(id, 'search_myself');
    expect(res.statusCode).toBe(500);
    expect(h.requests.get(id)).toMatchObject({ status: 'pushed', calibreBookId: BOOK });
    expect(grabbed(id)).toHaveLength(1);
  });

  it('refuses a request whose book is not in the library', async () => {
    await build();
    fakeFor(h, HOST).on('search', { body: fixture('search-empty.xml') });
    const req = await h.requests.add({ userId: h.userId, workId: WORK, query: QUERY, pushTo: [] });
    const res = await wrong(req.id, 'search_again');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'REQUEST_STATE' });
  });

  it('refuses a request someone else made, and an unknown choice', async () => {
    await build();
    const id = await delivered();
    expect((await wrong(id, 'search_myself', randomUUID())).statusCode).toBe(404);
    expect((await wrong(id, 'burn_it')).statusCode).toBe(400);
  });

  it('says the library is not set up', async () => {
    await build(false);
    const id = await delivered();
    const res = await wrong(id, 'search_myself');
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'LIBRARY_UNAVAILABLE' });
  });
});
