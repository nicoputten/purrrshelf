import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { releases, users } from '../src/db/schema.js';
import { readTag } from '../src/modules/importer/epub.js';
import {
  POLL_DOWNLOAD_JOB,
  ReleaseError,
  WAIT_IMPORT_JOB,
  type ImportLibrary,
} from '../src/modules/releases/pipeline.js';
import {
  SabnzbdError,
  type DownloadClient,
  type DownloadState,
} from '../src/modules/sabnzbd/client.js';
import { fixture } from './fake-newznab.js';
import { makeEpub } from './fake-epub.js';
import { QUERY, fakeFor, indexerInput, makeHarness, type Harness } from './downloads-harness.js';

const HOST = 'indexer.example.invalid';
const POLL = 15_000;

class FakeSab implements DownloadClient {
  added: { nzb: string; name: string }[] = [];
  states = new Map<string, DownloadState[]>();
  addError: Error | null = null;
  async add(nzb: Buffer, name: string) {
    if (this.addError) throw this.addError;
    this.added.push({ nzb: nzb.toString(), name });
    return `nzo_${this.added.length}`;
  }
  async status(id: string): Promise<DownloadState> {
    const list = this.states.get(id) ?? [];
    return list.length > 1 ? list.shift()! : (list[0] ?? { state: 'missing' });
  }
  async remove() {}
  async ping() {}
}

class FakeLibrary implements ImportLibrary {
  byIdentifier = new Map<string, number>();
  byTitle = new Map<string, number>();
  queries: unknown[] = [];
  async findBooks(q: Parameters<ImportLibrary['findBooks']>[0]) {
    this.queries.push(q);
    if (q.identifier) {
      const id = this.byIdentifier.get(q.identifier.value);
      return id ? [{ id }] : [];
    }
    const id = q.title ? this.byTitle.get(q.title) : undefined;
    return id ? [{ id }] : [];
  }
}

let h: Harness;
let sab: FakeSab;
let lib: FakeLibrary;
let root: string;
let downloads: string;
let ingest: string;

function harness(extra: Parameters<typeof makeHarness>[0] = {}) {
  return makeHarness({
    sab,
    importLibrary: lib,
    settings: {
      downloadsPath: downloads,
      ingestPath: ingest,
      pollIntervalMs: POLL,
      importTimeoutMs: 60_000,
    },
    ...extra,
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'purrshelf-pipeline-'));
  downloads = join(root, 'downloads');
  ingest = join(root, 'ingest');
  await mkdir(downloads);
  await mkdir(ingest);
  sab = new FakeSab();
  lib = new FakeLibrary();
  h = await harness();
  h.indexers.upsert(indexerInput());
  fakeFor(h, HOST)
    .on('search', { body: fixture('search-hit.xml') })
    .on('get', { body: fixture('release.nzb') });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function add() {
  return h.requests.add({ userId: h.userId, workId: 'work-1', query: QUERY, pushTo: [] });
}

function releaseRows(requestId: string) {
  return h.database.db.select().from(releases).where(eq(releases.requestId, requestId)).all();
}

async function tick() {
  h.clock.advance(POLL);
  return h.jobs.runDue();
}

async function finishDownload(nzo: string, files: Record<string, Buffer | string>) {
  const folder = join(downloads, `Download ${nzo}`);
  await mkdir(folder, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    await mkdir(join(folder, name, '..'), { recursive: true });
    await writeFile(join(folder, name), data);
  }
  sab.states.set(nzo, [{ state: 'completed', storage: `/sab/complete/kobopush/Download ${nzo}` }]);
}

describe('auto-pick', () => {
  it('scores the results, grabs the best and hands it to SABnzbd', async () => {
    const req = await add();
    expect(req).toMatchObject({ status: 'downloading', downloadId: 'nzo_1', progress: 0 });
    expect(sab.added).toEqual([{ nzb: fixture('release.nzb'), name: `kobopush-${req.id}` }]);
    expect(h.budget.status('primary', 'grab').used).toBe(1);
    const rows = releaseRows(req.id);
    const best = rows.find((r) => r.status === 'grabbed')!;
    expect(best.guid).toBe('https://indexer.example.invalid/details/aaa111');
    expect(best.score).toBeGreaterThan(60);
    const pdf = rows.find((r) => r.guid === 'ccc333')!;
    expect(JSON.parse(pdf.rejectedJson)).toContain('format_excluded');
    expect(h.jobs.pending(POLL_DOWNLOAD_JOB)).toHaveLength(1);
  });

  it('shows the list when nothing clears the threshold', async () => {
    fakeFor(h, HOST).on('search', {
      body: fixture('search-hit.xml').replace('(2021) EPUB', '(2021) PDF'),
    });
    const req = await add();
    expect(req.status).toBe('choose_release');
    expect(sab.added).toEqual([]);
    expect(h.budget.status('primary', 'grab').used).toBe(0);
  });

  it('does not grab while downloads are not set up', async () => {
    const bare = await makeHarness();
    bare.indexers.upsert(indexerInput());
    fakeFor(bare, HOST).on('search', { body: fixture('search-hit.xml') });
    const req = await bare.requests.add({
      userId: bare.userId,
      workId: 'w',
      query: QUERY,
      pushTo: [],
    });
    expect(req).toMatchObject({
      status: 'choose_release',
      error: expect.stringMatching(/not set up/),
    });
    expect(bare.budget.status('primary', 'grab').used).toBe(0);
    await expect(
      bare.pipeline.grab(req, releaseRows.call(null, req.id)[0]?.id ?? 'x'),
    ).rejects.toBeInstanceOf(ReleaseError);
  });

  it('keeps the list when the grab budget is empty', async () => {
    h.indexers.upsert(indexerInput({ grabLimitPerHour: 0 }));
    const req = await add();
    expect(req).toMatchObject({
      status: 'choose_release',
      error: expect.stringMatching(/No downloads left/),
    });
  });

  it('tries the next-best release when an NZB cannot be fetched', async () => {
    fakeFor(h, HOST).on('get', () => ({ body: 'nope' }));
    const req = await add();
    // The EPUB failed; the audiobook and PDF are rejected, so nothing is left.
    expect(req).toMatchObject({ status: 'download_failed' });
    expect(req.error).toMatch(
      /Could not fetch the NZB: Indexer did not return an NZB\. No other release left/,
    );
    expect(releaseRows(req.id).find((r) => r.guid.endsWith('aaa111'))!.status).toBe('failed');
  });

  it('fails the download when SABnzbd refuses, without spending more grabs', async () => {
    sab.addError = new SabnzbdError('SABnzbd: API Key Incorrect');
    const req = await add();
    expect(req).toMatchObject({ status: 'download_failed', error: 'SABnzbd: API Key Incorrect' });
    expect(h.budget.status('primary', 'grab').used).toBe(1);
  });

  it('refuses an unknown or failed release, and one whose indexer is gone', async () => {
    const req = await add();
    await expect(h.pipeline.grab(req, 'nope')).rejects.toThrow('not available');
    const failed = releaseRows(req.id)[0]!;
    h.database.db
      .update(releases)
      .set({ status: 'failed' })
      .where(eq(releases.id, failed.id))
      .run();
    await expect(h.pipeline.grab(req, failed.id)).rejects.toThrow('not available');
  });
});

describe('following the download', () => {
  it('updates progress, then imports a tagged EPUB into the ingest folder', async () => {
    const req = await add();
    sab.states.set('nzo_1', [
      { state: 'queued', percentage: 0 },
      { state: 'downloading', percentage: 41.6 },
      { state: 'processing' },
    ]);
    await tick();
    await tick();
    expect(h.requests.get(req.id).progress).toBe(42);
    await tick();
    expect(h.requests.get(req.id).status).toBe('downloading');

    await finishDownload('nzo_1', {
      'book.epub': makeEpub(),
      'smaller.mobi': 'x',
      'cover.jpg': 'y',
    });
    await tick();
    expect(h.requests.get(req.id)).toMatchObject({ status: 'importing', progress: 100 });
    const [file] = await readdir(ingest);
    expect(file).toBe(`kobopush-${req.id}.epub`);
    const data = await readFile(join(ingest, file!));
    expect(readTag(data)).toBe(req.id);
    expect((await stat(join(ingest, file!))).mode & 0o777).toBe(0o644);
    expect(h.jobs.pending(WAIT_IMPORT_JOB)).toHaveLength(1);

    // Not there yet; then CWA picks it up.
    await tick();
    expect(h.requests.get(req.id).status).toBe('importing');
    lib.byIdentifier.set(req.id, 501);
    await tick();
    expect(h.requests.get(req.id)).toMatchObject({ status: 'in_library', calibreBookId: 501 });
  });

  it('puts the imported book on the chosen Kobo', async () => {
    const shelved: { cwaUserId: number; bookId: number }[] = [];
    h = await harness({
      shelves: {
        addToKoboShelf: async (owner, bookId) => {
          shelved.push({ cwaUserId: owner.cwaUserId, bookId });
        },
      },
    });
    h.indexers.upsert(indexerInput());
    fakeFor(h, HOST)
      .on('search', { body: fixture('search-hit.xml') })
      .on('get', { body: fixture('release.nzb') });
    h.database.db.update(users).set({ cwaUserId: 11 }).where(eq(users.id, h.userId)).run();
    const req = await h.requests.add({
      userId: h.userId,
      workId: 'work-1',
      query: QUERY,
      pushTo: [h.userId],
    });
    await finishDownload('nzo_1', { 'book.epub': makeEpub() });
    await tick();
    lib.byIdentifier.set(req.id, 501);
    await tick();
    expect(h.requests.get(req.id)).toMatchObject({ status: 'pushed', calibreBookId: 501 });
    expect(shelved).toEqual([{ cwaUserId: 11, bookId: 501 }]);
  });

  it('imports AZW3 and MOBI untouched (CWA converts them to EPUB at ingest)', async () => {
    const req = await add();
    await finishDownload('nzo_1', { 'nested/book.azw3': 'AZW3DATA', 'book.mobi': 'MOBI' });
    await tick();
    expect(await readdir(ingest)).toEqual([`kobopush-${req.id}.azw3`]);
    expect(await readFile(join(ingest, `kobopush-${req.id}.azw3`), 'utf8')).toBe('AZW3DATA');
  });

  it('falls back to title and author when CWA dropped the identifier', async () => {
    const req = await add();
    await finishDownload('nzo_1', { 'book.epub': makeEpub() });
    await tick();
    lib.byTitle.set('The Lighthouse Cartographer', 77);
    await tick();
    expect(h.requests.get(req.id)).toMatchObject({ status: 'in_library', calibreBookId: 77 });
    expect(lib.queries.at(-1)).toEqual({
      title: 'The Lighthouse Cartographer',
      author: 'Ada Quill',
      limit: 1,
    });
  });

  it('times out with import_failed and a clear message', async () => {
    const req = await add();
    await finishDownload('nzo_1', { 'book.epub': makeEpub() });
    await tick();
    for (let i = 0; i < 5; i++) await tick();
    expect(h.requests.get(req.id)).toMatchObject({
      status: 'import_failed',
      error: 'CWA did not add the book to the library within 1 minutes',
    });
    expect(h.jobs.pending(WAIT_IMPORT_JOB)).toEqual([]);
  });

  it.each([
    [{ 'notes.txt': 'x' }, 'The download contains no EPUB, AZW3 or MOBI'],
    [
      { 'book.epub': 'not a zip' },
      'Cannot import the ebook: Not an EPUB: the file is not a zip archive',
    ],
  ])('fails the import for %j', async (files, error) => {
    const req = await add();
    await finishDownload('nzo_1', files);
    await tick();
    expect(h.requests.get(req.id)).toMatchObject({ status: 'import_failed', error });
  });

  it('refuses a book over the size cap', async () => {
    const small = await makeHarness({
      sab,
      importLibrary: lib,
      settings: {
        downloadsPath: downloads,
        ingestPath: ingest,
        pollIntervalMs: POLL,
        maxBookBytes: 10,
      },
    });
    small.indexers.upsert(indexerInput());
    fakeFor(small, HOST)
      .on('search', { body: fixture('search-hit.xml') })
      .on('get', { body: fixture('release.nzb') });
    const req = await small.requests.add({
      userId: small.userId,
      workId: 'w',
      query: QUERY,
      pushTo: [],
    });
    await finishDownload(req.downloadId!, { 'book.epub': makeEpub() });
    small.clock.advance(POLL);
    await small.jobs.runDue();
    expect(small.requests.get(req.id)).toMatchObject({
      status: 'import_failed',
      error: 'The ebook is larger than the size cap',
    });
  });

  it('fails the import when the download folder is missing', async () => {
    const req = await add();
    sab.states.set('nzo_1', [{ state: 'completed', storage: '/sab/complete/kobopush/gone' }]);
    await tick();
    expect(h.requests.get(req.id).error).toMatch(/^Cannot read the download/);
  });

  it('fails the import when the ingest folder is not writable', async () => {
    const req = await add();
    await rm(ingest, { recursive: true });
    await finishDownload('nzo_1', { 'book.epub': makeEpub() });
    await tick();
    expect(h.requests.get(req.id).error).toMatch(/^Cannot import the ebook/);
  });

  it('tries the next-best release from the same list after a failed download', async () => {
    fakeFor(h, HOST).on('search', {
      body: fixture('search-hit.xml')
        .replace(
          'The Lighthouse Cartographer Audiobook MP3',
          'Ada Quill - The Lighthouse Cartographer MOBI',
        )
        .replace('length="350000000"', 'length="2400000"'),
    });
    const req = await add();
    const searches = h.budget.status('primary', 'search').used;
    sab.states.set('nzo_1', [{ state: 'failed', message: 'Repair failed' }]);
    await tick();
    expect(h.requests.get(req.id)).toMatchObject({ status: 'downloading', downloadId: 'nzo_2' });
    expect(h.budget.status('primary', 'search').used).toBe(searches);
    expect(h.budget.status('primary', 'grab').used).toBe(2);

    // The second one is lost too: nothing left.
    await tick();
    expect(h.requests.get(req.id)).toMatchObject({
      status: 'download_failed',
      error: 'SABnzbd lost the download. No other release left; try another one or search again.',
    });
  });

  it('does nothing for a request that moved on, or without SABnzbd', async () => {
    const req = await add();
    h.requests.cancel(req.id);
    expect(await tick()).toBe(1);
    await h.pipeline.waitImportJob({ requestId: req.id, deadline: 0 });
    expect(h.requests.get(req.id).status).toBe('cancelled');

    const bare = await makeHarness();
    await bare.pipeline.pollJob({ requestId: 'nope' });
    await bare.pipeline.waitImportJob({ requestId: 'nope', deadline: 0 });
  });
});
