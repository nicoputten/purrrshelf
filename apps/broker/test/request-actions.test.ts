import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookRequest, ReleaseList, requestEventsPath } from '@purrshelf/contract';
import { eq } from 'drizzle-orm';
import { registerErrorHandling } from '../src/errors.js';
import { releases, requests } from '../src/db/schema.js';
import type { PreHandler } from '../src/modules/auth/authenticate.js';
import { requestRoutes } from '../src/modules/requests/routes.js';
import { requestView } from '../src/modules/requests/view.js';
import type { ImportLibrary } from '../src/modules/releases/pipeline.js';
import type { DownloadClient, DownloadState } from '../src/modules/sabnzbd/client.js';
import { fixture } from './fake-newznab.js';
import { QUERY, fakeFor, indexerInput, makeHarness, type Harness } from './downloads-harness.js';

const HOST = 'indexer.example.invalid';
const WORK = 'hardcover:301';

class FakeSab implements DownloadClient {
  added: string[] = [];
  removed: string[] = [];
  removeFails = false;
  async add(_nzb: Buffer, name: string) {
    this.added.push(name);
    return `nzo_${this.added.length}`;
  }
  async status(): Promise<DownloadState> {
    return { state: 'downloading', percentage: 10 };
  }
  async remove(id: string) {
    if (this.removeFails) throw new Error('SABnzbd is down');
    this.removed.push(id);
  }
  async ping() {}
}

const noBooks: ImportLibrary = { findBooks: async () => [] };

let h: Harness;
let sab: FakeSab;
let app: FastifyInstance;
let root: string;
let otherUser: string;

/** Sets the user from a header; the real app uses the bearer token. */
const fakeAuth: PreHandler = async (request) => {
  request.userId = (request.headers['x-user'] as string | undefined) ?? h.userId;
};

async function build(withServices = true, extra: Parameters<typeof makeHarness>[0] = {}) {
  root = await mkdtemp(join(tmpdir(), 'purrshelf-actions-'));
  await mkdir(join(root, 'downloads'));
  await mkdir(join(root, 'ingest'));
  sab = new FakeSab();
  h = await makeHarness(
    withServices
      ? {
          sab,
          importLibrary: noBooks,
          settings: { downloadsPath: join(root, 'downloads'), ingestPath: join(root, 'ingest') },
          ...extra,
        }
      : extra,
  );
  h.indexers.upsert(indexerInput());
  fakeFor(h, HOST)
    .on('search', { body: fixture('search-hit.xml') })
    .on('get', { body: fixture('release.nzb') });
  otherUser = randomUUID();
  // Closing must not wait for the event stream's keep-alive socket.
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

const call = (method: 'GET' | 'POST', url: string, user?: string) =>
  app.inject({ method, url: `/api/v1${url}`, headers: user ? { 'x-user': user } : {} });

async function added(): Promise<BookRequest> {
  const req = await h.requests.add({ userId: h.userId, workId: WORK, query: QUERY, pushTo: [] });
  return BookRequest.parse((await call('GET', `/requests/${req.id}`)).json());
}

/** A second acceptable EPUB, as if the search had found it too. */
function addRelease(requestId: string, title: string, language: string | null = 'Dutch') {
  const id = randomUUID();
  h.database.db
    .insert(releases)
    .values({
      id,
      requestId,
      indexerId: 'primary',
      guid: `guid-${id}`,
      title,
      size: 1_400_000,
      category: '7020',
      format: 'epub',
      language,
      grabs: 3,
      publishedAt: new Date('2022-05-01T00:00:00Z'),
      createdAt: h.clock.fn(),
    })
    .run();
  return id;
}

describe('a request as the app sees it', () => {
  beforeEach(() => build());

  it('says what was searched and which release is downloading', async () => {
    const req = await added();
    expect(req).toMatchObject({
      status: 'downloading',
      progress: 0,
      searches: 1,
      searchedOn: ['Primary'],
      release: {
        title: 'Ada Quill - The Lighthouse Cartographer (2021) EPUB',
        format: 'epub',
        size: 2_400_000,
        language: 'en',
      },
    });
  });
});

describe('GET /requests/:id/releases', () => {
  beforeEach(() => build());

  it('lists what the search found, best first, without searching again', async () => {
    const req = await added();
    const nl = addRelease(req.id, 'Ada Quill - De Vuurtorencartograaf NL EPUB');
    const calls = h.calls();
    const res = await call('GET', `/requests/${req.id}/releases`);
    expect(res.statusCode).toBe(200);
    const list = ReleaseList.parse(res.json());
    expect(h.calls()).toBe(calls);
    expect(list.acceptThreshold).toBe(60);
    const [best, ...rest] = list.releases;
    expect(best).toMatchObject({
      picked: true,
      format: 'epub',
      language: 'en',
      indexerName: 'Primary',
      grabs: 42,
      publishedAt: '2021-03-01T10:00:00.000Z',
      rejected: [],
      titleMatch: true,
      authorMatch: true,
    });
    expect(rest.find((r) => r.id === nl)).toMatchObject({
      picked: false,
      language: 'nl',
      rejected: ['language_mismatch', 'title_mismatch'],
    });
    const left = rest.filter((r) => r.rejected.length > 0).map((r) => r.rejected);
    expect(left.some((r) => r.includes('audiobook'))).toBe(true);
    // Left-out releases come last.
    expect(list.releases.findIndex((r) => r.rejected.length > 0)).toBeGreaterThan(0);
  });

  it("does not show someone else's releases", async () => {
    const req = await added();
    expect((await call('GET', `/requests/${req.id}/releases`, otherUser)).statusCode).toBe(404);
  });
});

describe('POST /requests/:id/releases/:releaseId (Pick another)', () => {
  beforeEach(() => build());

  it('stops the running download and grabs the chosen one, with no search', async () => {
    const req = await added();
    const other = addRelease(req.id, 'Ada Quill - The Lighthouse Cartographer retail EPUB', null);
    const calls = h.calls();
    const res = await call('POST', `/requests/${req.id}/releases/${other}`);
    expect(res.statusCode).toBe(200);
    const body = BookRequest.parse(res.json());
    expect(body).toMatchObject({ status: 'downloading', release: { id: other } });
    expect(sab.removed).toEqual(['nzo_1']);
    expect(sab.added).toHaveLength(2);
    // One NZB grab, no search.
    expect(h.calls()).toBe(calls + 1);
    const list = ReleaseList.parse((await call('GET', `/requests/${req.id}/releases`)).json());
    expect(list.releases.filter((r) => r.picked).map((r) => r.id)).toEqual([other]);
  });

  it('answers an unexpected failure as an internal error', async () => {
    const req = await added();
    vi.spyOn(h.pipeline, 'pickAnother').mockRejectedValue(new Error('disk full'));
    const res = await call('POST', `/requests/${req.id}/releases/${req.release!.id}`);
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('does nothing when the release is already downloading', async () => {
    const req = await added();
    const res = await call('POST', `/requests/${req.id}/releases/${req.release!.id}`);
    expect(BookRequest.parse(res.json()).status).toBe('downloading');
    expect(sab.removed).toEqual([]);
  });

  it('still switches when SABnzbd cannot remove the old download', async () => {
    const req = await added();
    sab.removeFails = true;
    const other = addRelease(req.id, 'Ada Quill - The Lighthouse Cartographer retail EPUB', null);
    expect((await call('POST', `/requests/${req.id}/releases/${other}`)).statusCode).toBe(200);
  });

  it('refuses a release that is gone or failed, and a request that cannot download now', async () => {
    const req = await added();
    const missing = await call('POST', `/requests/${req.id}/releases/nope`);
    expect(missing.statusCode).toBe(409);
    expect(missing.json()).toMatchObject({ code: 'RELEASE_UNAVAILABLE' });
    const failed = addRelease(req.id, 'Ada Quill - The Lighthouse Cartographer EPUB');
    h.database.db.update(releases).set({ status: 'failed' }).where(eq(releases.id, failed)).run();
    expect((await call('POST', `/requests/${req.id}/releases/${failed}`)).json()).toMatchObject({
      code: 'RELEASE_UNAVAILABLE',
    });
    const list = ReleaseList.parse((await call('GET', `/requests/${req.id}/releases`)).json());
    expect(list.releases.at(-1)).toMatchObject({ id: failed, rejected: ['failed_before'] });

    h.database.db.update(requests).set({ status: 'pushed' }).where(eq(requests.id, req.id)).run();
    expect((await call('POST', `/requests/${req.id}/releases/${failed}`)).json()).toMatchObject({
      code: 'REQUEST_STATE',
    });
  });
});

describe('without SABnzbd', () => {
  beforeEach(() => build(false));

  it('says downloads are not set up', async () => {
    const req = await added();
    expect(req.status).toBe('choose_release');
    const list = ReleaseList.parse((await call('GET', `/requests/${req.id}/releases`)).json());
    const res = await call('POST', `/requests/${req.id}/releases/${list.releases[0]!.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'DOWNLOADS_NOT_SET_UP' });
    // Cancel needs no SABnzbd.
    const cancelled = await call('POST', `/requests/${req.id}/cancel`);
    expect(BookRequest.parse(cancelled.json()).status).toBe('cancelled');
  });
});

describe('POST /requests/:id/retry and /cancel', () => {
  beforeEach(() => build());

  it('starts a new paid round for a request that was not found', async () => {
    fakeFor(h, HOST).on('search', { body: fixture('search-empty.xml') });
    const req = await added();
    expect(req).toMatchObject({ status: 'not_found', searches: 3 });
    h.clock.advance(60_000);
    const res = await call('POST', `/requests/${req.id}/retry`);
    expect(res.statusCode).toBe(200);
    expect(BookRequest.parse(res.json()).status).toBe('searching');
    await vi.waitFor(async () =>
      expect(BookRequest.parse((await call('GET', `/requests/${req.id}`)).json()).searches).toBe(6),
    );
  });

  it('refuses Try again while the request is on its way', async () => {
    const req = await added();
    const res = await call('POST', `/requests/${req.id}/retry`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'REQUEST_STATE' });
  });

  it('stops the download when a request is cancelled', async () => {
    const req = await added();
    const res = await call('POST', `/requests/${req.id}/cancel`);
    expect(BookRequest.parse(res.json()).status).toBe('cancelled');
    expect(sab.removed).toEqual(['nzo_1']);
    const again = await call('POST', `/requests/${req.id}/cancel`);
    expect(again.json()).toMatchObject({ code: 'REQUEST_STATE' });
  });

  it('logs a retry that fails after it was answered', async () => {
    await app.close();
    await build(true, {
      libraryItems: {
        ensure: () => Promise.reject(new Error('database is locked')),
        own: () => undefined,
      },
    });
    fakeFor(h, HOST).on('search', { body: fixture('search-empty.xml') });
    const req = await added();
    const errors = vi.spyOn(app.log, 'error');
    // The library has it now, and owning it fails.
    h.library.books.set(QUERY.title, 9);
    await call('POST', `/requests/${req.id}/retry`);
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
  });
});

describe('GET /requests/events', () => {
  beforeEach(() => build());

  it("streams my request changes as they happen, and nobody else's", async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const res = await fetch(`${address}/api/v1${requestEventsPath}`);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const until = async (pattern: RegExp) => {
      while (!pattern.test(text)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        text += decoder.decode(value);
      }
    };
    await until(/: connected/);
    expect(h.events.size).toBe(1);
    // Someone else's request is not sent.
    h.events.emit({
      ...(await h.requests.add({ userId: h.userId, workId: WORK, query: QUERY, pushTo: [] })),
      userId: otherUser,
    });
    await until(/"status":"downloading"/);
    const events = text
      .split('\n\n')
      .filter((e) => e.startsWith('event: request'))
      .map((e) => BookRequest.parse(JSON.parse(e.split('data: ')[1]!)));
    expect(events.map((e) => e.status)).toEqual(['searching', 'downloading']);
    await reader.cancel();
    await vi.waitFor(() => expect(h.events.size).toBe(0));
  });
});
