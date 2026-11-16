import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookRequest, ManualSearchResult, ReleaseList, RequestSearches } from '@purrshelf/contract';
import { registerErrorHandling } from '../src/errors.js';
import type { PreHandler } from '../src/modules/auth/authenticate.js';
import { requestRoutes } from '../src/modules/requests/routes.js';
import { attemptWords, requestSearches, requestView } from '../src/modules/requests/view.js';
import type { ImportLibrary } from '../src/modules/releases/pipeline.js';
import type { DownloadClient, DownloadState } from '../src/modules/sabnzbd/client.js';
import { fixture } from './fake-newznab.js';
import { QUERY, fakeFor, indexerInput, makeHarness, type Harness } from './downloads-harness.js';

const HOST = 'indexer.example.invalid';
const WORK = 'hardcover:301';

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

const noBooks: ImportLibrary = { findBooks: async () => [] };

let h: Harness;
let sab: FakeSab;
let app: FastifyInstance;
let root: string;

const fakeAuth: PreHandler = async (request) => {
  request.userId = (request.headers['x-user'] as string | undefined) ?? h.userId;
};

async function build(searchLimitPerDay = 25) {
  root = await mkdtemp(join(tmpdir(), 'purrshelf-manual-'));
  await mkdir(join(root, 'downloads'));
  await mkdir(join(root, 'ingest'));
  sab = new FakeSab();
  h = await makeHarness({
    sab,
    importLibrary: noBooks,
    settings: { downloadsPath: join(root, 'downloads'), ingestPath: join(root, 'ingest') },
  });
  h.indexers.upsert(indexerInput({ searchLimitPerDay }));
  // The automatic search finds nothing; the reader's own words do.
  fakeFor(h, HOST)
    .on('search', { body: fixture('search-empty.xml') })
    .on('search:Lighthouse Cartographer map', { body: fixture('search-hit.xml') })
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

async function notFound(): Promise<BookRequest> {
  const req = await h.requests.add({ userId: h.userId, workId: WORK, query: QUERY, pushTo: [] });
  expect(req.status).toBe('not_found');
  return requestView(h.database.db, req);
}

const search = (id: string, words: string, indexerId = 'primary') =>
  call('POST', `/requests/${id}/search`, { words, indexerId });

describe('POST /requests/:id/search (Search it yourself)', () => {
  beforeEach(() => build());

  it('spends one search on the chosen indexer and waits for the reader to pick', async () => {
    const req = await notFound();
    const before = h.calls();
    const res = await search(req.id, '  Lighthouse Cartographer map ');
    expect(res.statusCode).toBe(200);
    const body = ManualSearchResult.parse(res.json());
    expect(body.resultCount).toBe(3);
    expect(body.request).toMatchObject({ status: 'choose_release', searches: 4, error: null });
    expect(h.calls()).toBe(before + 1);
    const url = fakeFor(h, HOST).calls.at(-1)!;
    expect(url.searchParams.get('t')).toBe('search');
    expect(url.searchParams.get('q')).toBe('Lighthouse Cartographer map');
    expect(url.searchParams.get('cat')).toBe('7000');
    // Nothing is grabbed: the reader picks.
    expect(sab.added).toEqual([]);
    const list = ReleaseList.parse((await call('GET', `/requests/${req.id}/releases`)).json());
    expect(list.releases.map((r) => r.title)).toEqual([
      'Ada Quill - The Lighthouse Cartographer (2021) EPUB',
      'The Lighthouse Cartographer Audiobook MP3',
      'Unrelated Book PDF',
    ]);
    expect(list.releases[2]!.rejected).toContain('title_mismatch');
  });

  it('lets the reader fetch a release the scorer would leave out', async () => {
    const req = await notFound();
    await search(req.id, 'Lighthouse Cartographer map');
    const list = ReleaseList.parse((await call('GET', `/requests/${req.id}/releases`)).json());
    const other = list.releases.find((r) => r.title === 'Unrelated Book PDF')!;
    const res = await call('POST', `/requests/${req.id}/releases/${other.id}`);
    expect(BookRequest.parse(res.json())).toMatchObject({ status: 'downloading' });
    expect(sab.added).toHaveLength(1);
  });

  it('searches again from the pick step, replacing the earlier results', async () => {
    const req = await notFound();
    await search(req.id, 'Lighthouse Cartographer map');
    fakeFor(h, HOST).on('search:Quill lighthouse', { body: fixture('search-many.xml') });
    const res = ManualSearchResult.parse((await search(req.id, 'Quill lighthouse')).json());
    expect(res.request.status).toBe('choose_release');
    const list = ReleaseList.parse((await call('GET', `/requests/${req.id}/releases`)).json());
    expect(list.releases).toHaveLength(res.resultCount);
  });

  it('does not change the order of the automatic queries', async () => {
    const req = await notFound();
    const fake = fakeFor(h, HOST);
    const firstRound = fake.calls.map((u) => u.searchParams.get('q'));
    await search(req.id, 'Lighthouse Cartographer map');
    const other = await h.requests.add({
      userId: h.userId,
      workId: 'hardcover:302',
      query: QUERY,
      pushTo: [],
    });
    expect(other.status).toBe('not_found');
    const secondRound = fake.calls.slice(-3).map((u) => u.searchParams.get('q'));
    expect(secondRound).toEqual(firstRound);
  });

  it('leaves the request as it was when nothing comes back', async () => {
    const req = await notFound();
    const res = ManualSearchResult.parse((await search(req.id, 'nothing like it')).json());
    expect(res.resultCount).toBe(0);
    expect(res.request).toMatchObject({ status: 'not_found', searches: 4 });
  });

  it('works on a request made without a search', async () => {
    const res = await call('POST', '/requests', {
      workId: WORK,
      language: 'en',
      pushTo: [],
      search: 'manual',
    });
    expect(res.statusCode).toBe(201);
    const req = BookRequest.parse(res.json());
    expect(req).toMatchObject({ status: 'choose_release', searches: 0 });
    expect(h.calls()).toBe(0);
    const found = ManualSearchResult.parse(
      (await search(req.id, 'Lighthouse Cartographer map')).json(),
    );
    expect(found.request).toMatchObject({ status: 'choose_release', searches: 1 });
  });

  it('refuses while the request is on its way', async () => {
    fakeFor(h, HOST).on('search', { body: fixture('search-hit.xml') });
    const req = await h.requests.add({ userId: h.userId, workId: WORK, query: QUERY, pushTo: [] });
    expect(req.status).toBe('downloading');
    const res = await search(req.id, 'Lighthouse Cartographer map');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'REQUEST_STATE' });
  });

  it('answers 0 results when the request moved on while the indexer answered', async () => {
    const req = await notFound();
    fakeFor(h, HOST).on('search:Lighthouse Cartographer map', () => {
      h.requests.cancel(req.id);
      return { body: fixture('search-hit.xml') };
    });
    const res = ManualSearchResult.parse(
      (await search(req.id, 'Lighthouse Cartographer map')).json(),
    );
    expect(res.request.status).toBe('cancelled');
  });

  it("does not search someone else's request, or with empty words", async () => {
    const req = await notFound();
    const other = await call(
      'POST',
      `/requests/${req.id}/search`,
      { words: 'x', indexerId: 'primary' },
      randomUUID(),
    );
    expect(other.statusCode).toBe(404);
    const empty = await search(req.id, '   ');
    expect(empty.statusCode).toBe(400);
  });

  it('refuses an unknown or switched-off indexer without spending anything', async () => {
    const req = await notFound();
    const before = h.calls();
    const unknown = await search(req.id, 'Lighthouse', 'nope');
    expect(unknown.statusCode).toBe(502);
    expect(unknown.json()).toMatchObject({ code: 'INDEXER_UNAVAILABLE' });
    h.indexers.upsert(indexerInput({ id: 'off', name: 'Off', searchLimitPerDay: 0 }));
    const off = await search(req.id, 'Lighthouse', 'off');
    expect(off.json()).toMatchObject({ code: 'INDEXER_UNAVAILABLE' });
    expect(h.calls()).toBe(before);
  });

  it('records an indexer error as a spent, failed search', async () => {
    const req = await notFound();
    fakeFor(h, HOST).on('search:broken words', { status: 500, body: 'oops' });
    const res = await search(req.id, 'broken words');
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'INDEXER_UNAVAILABLE' });
    const tried = RequestSearches.parse((await call('GET', `/requests/${req.id}/searches`)).json());
    expect(tried.searches[0]).toMatchObject({ words: 'broken words', failed: true, manual: true });
  });

  it("says when the indexer's own limit was reached", async () => {
    const req = await notFound();
    fakeFor(h, HOST).on('search:limit words', { body: fixture('error-limit.xml') });
    const res = await search(req.id, 'limit words');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'BUDGET_EXHAUSTED' });
  });
});

describe('with no searches left', () => {
  beforeEach(() => build(3));

  it('answers BUDGET_EXHAUSTED with the time a search frees up, and queues nothing', async () => {
    const req = await notFound();
    const before = h.calls();
    const res = await search(req.id, 'Lighthouse Cartographer map');
    expect(res.statusCode).toBe(409);
    const body = res.json() as { code: string; details: { nextFreeAt: string } };
    expect(body.code).toBe('BUDGET_EXHAUSTED');
    expect(Date.parse(body.details.nextFreeAt)).toBeGreaterThan(h.clock.fn().getTime());
    expect(h.calls()).toBe(before);
    const after = BookRequest.parse((await call('GET', `/requests/${req.id}`)).json());
    expect(after.status).toBe('not_found');
  });
});

describe('GET /requests/:id/searches (What we tried)', () => {
  beforeEach(() => build());

  it('lists every search with its words, newest first, for free', async () => {
    const req = await notFound();
    await search(req.id, 'Lighthouse Cartographer map');
    const before = h.calls();
    const res = await call('GET', `/requests/${req.id}/searches`);
    expect(res.statusCode).toBe(200);
    const { searches } = RequestSearches.parse(res.json());
    expect(h.calls()).toBe(before);
    expect(searches).toHaveLength(4);
    expect(searches[0]).toMatchObject({
      words: 'Lighthouse Cartographer map',
      indexerName: 'Primary',
      resultCount: 3,
      hit: true,
      manual: true,
      failed: false,
    });
    expect(searches.slice(1).every((s) => !s.manual && s.resultCount === 0)).toBe(true);
    expect(searches.map((s) => s.words)).toContain('Ada Quill The Lighthouse Cartographer');
  });
});

describe('attemptWords', () => {
  it('reads the words out of each kind of stored query', () => {
    expect(attemptWords('search q=Atlas Pa Salt')).toBe('Atlas Pa Salt');
    expect(attemptWords('book title=Atlas author=Lucy Fable')).toBe('Lucy Fable Atlas');
    expect(attemptWords('book title=Atlas')).toBe('Atlas');
    expect(attemptWords('something else')).toBe('something else');
  });
});
