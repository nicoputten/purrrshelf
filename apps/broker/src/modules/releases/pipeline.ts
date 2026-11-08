import { constants } from 'node:fs';
import { chmod, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import {
  releases,
  requests,
  type ReleaseRow,
  type RequestRow,
  type RequestStatus,
} from '../../db/schema.js';
import { BudgetExhaustedError } from '../budget/budget.js';
import type { IndexerGateway } from '../budget/gateway.js';
import { tagEpub, IDENTIFIER_SCHEME } from '../importer/epub.js';
import type { IndexerRepository } from '../indexers/repository.js';
import { assertTransition } from '../requests/status.js';
import type { DownloadClient } from '../sabnzbd/client.js';
import { cleanTitle, type BookQuery } from '../search/planner.js';
import { rankReleases } from './scoring.js';

export const POLL_DOWNLOAD_JOB = 'poll_download';
export const WAIT_IMPORT_JOB = 'wait_import';

/** The part of the library adapter (BRK-03) the importer needs. */
export interface ImportLibrary {
  findBooks: (query: {
    identifier?: { type: string; value: string };
    title?: string;
    author?: string;
    limit?: number;
  }) => Promise<{ id: number }[]>;
}

export interface PipelineSettings {
  /** SABnzbd's kobopush complete folder as mounted in the broker. */
  downloadsPath: string;
  /** CWA's ingest folder as mounted in the broker. */
  ingestPath: string;
  pollIntervalMs: number;
  importTimeoutMs: number;
  maxBookBytes: number;
}

export type Schedule = (type: string, payload: unknown, runAt: Date) => void;

export interface PipelineDeps {
  db: Db;
  clock: Clock;
  gateway: IndexerGateway;
  indexers: IndexerRepository;
  /** Null until SABnzbd is configured. */
  sab: DownloadClient | null;
  /** Null until the library (CWA) is configured. */
  library: ImportLibrary | null;
  schedule: Schedule;
  settings: PipelineSettings;
  /** Ownership and Kobo shelves once CWA has the book (APP-03). */
  onImported?: (request: RequestRow) => Promise<RequestRow>;
}

const JobPayload = z.object({ requestId: z.string() });
const WaitPayload = JobPayload.extend({ deadline: z.number() });

/** Ebook files the importer accepts, best first. CWA converts AZW3/MOBI to EPUB at ingest. */
const EBOOK_EXTS = ['.epub', '.azw3', '.mobi'];

const NOT_SET_UP = 'Downloads are not set up yet: SABnzbd or the library is not configured';

export class ReleaseError extends Error {
  override name = 'ReleaseError';
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => {
      const full = join(dir, e.name);
      return e.isDirectory() ? listFiles(full) : Promise.resolve(e.isFile() ? [full] : []);
    }),
  );
  return nested.flat();
}

/**
 * After a search found results: score them, grab the best (or show the
 * list), hand the NZB to SABnzbd, follow the download, put the book in CWA's
 * ingest folder and wait until it is in the library (BRK-06, ADR 0006).
 */
export class ReleasePipeline {
  constructor(private readonly deps: PipelineDeps) {}

  private get db(): Db {
    return this.deps.db;
  }

  /** Called with a request in `searching` whose search stored candidates. */
  async pick(request: RequestRow): Promise<RequestRow> {
    const ranked = this.rank(request);
    if (!this.services()) {
      return this.setStatus(request, 'choose_release', { error: NOT_SET_UP });
    }
    if (!ranked.best) return this.setStatus(request, 'choose_release');
    return this.grab(request, ranked.best.release.id);
  }

  private services(): { sab: DownloadClient; library: ImportLibrary } | null {
    const { sab, library } = this.deps;
    return sab && library ? { sab, library } : null;
  }

  /** The releases of a request, scored, best first (for "Pick another"). */
  rank(request: RequestRow) {
    const rows = this.db.select().from(releases).where(eq(releases.requestId, request.id)).all();
    const failed = new Set(rows.filter((r) => r.status === 'failed').map((r) => r.guid));
    const query = JSON.parse(request.queryJson) as BookQuery;
    const candidates = rows.filter((r) => r.status !== 'failed');
    const result = rankReleases(query, candidates, { now: this.deps.clock(), failedGuids: failed });
    for (const r of result.ranked) {
      this.db
        .update(releases)
        .set({ score: r.score, rejectedJson: JSON.stringify(r.rejected) })
        .where(eq(releases.id, r.release.id))
        .run();
    }
    return result;
  }

  /**
   * Grabs one release: downloads its NZB (one grab from the budget) and adds
   * it to SABnzbd. Used for the auto-pick, "Pick another" and the fallback
   * after a failed download. When the NZB cannot be fetched, the next-best
   * release is tried; nothing is searched again.
   */
  async grab(request: RequestRow, releaseId: string): Promise<RequestRow> {
    const services = this.services();
    if (!services) throw new ReleaseError(NOT_SET_UP);
    const release = this.release(request, releaseId);
    if (!release || release.status === 'failed') {
      throw new ReleaseError('That release is not available for this request');
    }
    const indexer = this.deps.indexers.get(release.indexerId);
    let nzb: Buffer;
    try {
      if (!indexer) throw new ReleaseError('The indexer of this release was removed');
      nzb = await this.deps.gateway.grab(indexer, release.guid);
    } catch (err) {
      if (err instanceof BudgetExhaustedError) {
        return this.setStatus(request, 'choose_release', {
          error: `No downloads left on this indexer until ${err.nextFreeAt.toISOString()}`,
        });
      }
      this.markFailed(release);
      return this.next(request, `Could not fetch the NZB: ${message(err)}`);
    }
    let downloadId: string;
    try {
      downloadId = await services.sab.add(nzb, `kobopush-${request.id}`);
    } catch (err) {
      // SABnzbd itself is the problem: don't burn more grabs on other releases.
      return this.setStatus(request, 'download_failed', { error: message(err) });
    }
    this.db.update(releases).set({ status: 'grabbed' }).where(eq(releases.id, release.id)).run();
    const row = this.setStatus(request, 'downloading', { downloadId, progress: 0 });
    this.later(POLL_DOWNLOAD_JOB, { requestId: row.id });
    return row;
  }

  /** Job: follows the SABnzbd download. */
  readonly pollJob = async (payload: unknown): Promise<void> => {
    const request = this.find(JobPayload.parse(payload).requestId);
    const services = this.services();
    if (request?.status !== 'downloading' || !request.downloadId || !services) return;
    const state = await services.sab.status(request.downloadId);
    switch (state.state) {
      case 'queued':
      case 'downloading':
      case 'paused':
        this.update(request, { progress: Math.round(state.percentage) });
        this.later(POLL_DOWNLOAD_JOB, { requestId: request.id });
        return;
      case 'processing':
        this.later(POLL_DOWNLOAD_JOB, { requestId: request.id });
        return;
      case 'completed':
        await this.importFrom(
          this.setStatus(request, 'importing', { progress: 100 }),
          state.storage,
        );
        return;
      case 'failed':
      case 'missing': {
        const grabbed = this.db
          .select()
          .from(releases)
          .where(and(eq(releases.requestId, request.id), eq(releases.status, 'grabbed')))
          .all();
        for (const r of grabbed) this.markFailed(r);
        const reason = state.state === 'failed' ? state.message : 'SABnzbd lost the download';
        await this.next(request, reason);
        return;
      }
    }
  };

  /** Job: waits until CWA has the book in metadata.db. */
  readonly waitImportJob = async (payload: unknown): Promise<void> => {
    const { requestId, deadline } = WaitPayload.parse(payload);
    const request = this.find(requestId);
    const services = this.services();
    if (request?.status !== 'importing' || !services) return;
    const book = await this.findImported(services.library, request);
    if (book) {
      const row = this.setStatus(request, 'in_library', { calibreBookId: book.id });
      await this.deps.onImported?.(row);
      return;
    }
    if (this.deps.clock().getTime() >= deadline) {
      const minutes = Math.round(this.deps.settings.importTimeoutMs / 60_000);
      this.setStatus(request, 'import_failed', {
        error: `CWA did not add the book to the library within ${minutes} minutes`,
      });
      return;
    }
    this.later(WAIT_IMPORT_JOB, { requestId, deadline });
  };

  private async findImported(
    lib: ImportLibrary,
    request: RequestRow,
  ): Promise<{ id: number } | undefined> {
    const [tagged] = await lib.findBooks({
      identifier: { type: IDENTIFIER_SCHEME, value: request.id },
      limit: 1,
    });
    if (tagged) return tagged;
    // Fallback: CWA may drop the identifier; the library check found no copy before the add.
    const query = JSON.parse(request.queryJson) as BookQuery;
    const [byTitle] = await lib.findBooks({
      title: cleanTitle(query.title),
      ...(query.authors[0] ? { author: query.authors[0] } : {}),
      limit: 1,
    });
    return byTitle;
  }

  /** Picks the ebook out of the finished download and drops it in CWA's ingest folder. */
  private async importFrom(request: RequestRow, storage: string): Promise<void> {
    const { settings } = this.deps;
    // SABnzbd reports its own path; the same folder is mounted at downloadsPath here.
    const folder = join(settings.downloadsPath, basename(storage));
    let book: { path: string; ext: string; size: number } | undefined;
    try {
      const files = await listFiles(folder);
      const found = await Promise.all(
        files
          .map((path) => ({ path, ext: extname(path).toLowerCase() }))
          .filter((f) => EBOOK_EXTS.includes(f.ext))
          .map(async (f) => ({ ...f, size: (await stat(f.path)).size })),
      );
      found.sort(
        (a, b) => EBOOK_EXTS.indexOf(a.ext) - EBOOK_EXTS.indexOf(b.ext) || b.size - a.size,
      );
      book = found[0];
    } catch (err) {
      this.setStatus(request, 'import_failed', {
        error: `Cannot read the download: ${message(err)}`,
      });
      return;
    }
    if (!book) {
      this.setStatus(request, 'import_failed', {
        error: 'The download contains no EPUB, AZW3 or MOBI',
      });
      return;
    }
    if (book.size > settings.maxBookBytes) {
      this.setStatus(request, 'import_failed', { error: 'The ebook is larger than the size cap' });
      return;
    }
    try {
      const data = await readFile(book.path);
      // The library stores EPUB; CWA makes KEPUB at Kobo sync time (ADR 0016). Never convert here.
      const out = book.ext === '.epub' ? tagEpub(data, request.id) : data;
      const target = join(settings.ingestPath, `kobopush-${request.id}${book.ext}`);
      const partial = join(settings.ingestPath, `.kobopush-${request.id}.part`);
      await writeFile(partial, out, { mode: 0o644 });
      // CWA runs as UID 568: the file must be world-readable whatever the umask.
      await chmod(
        partial,
        constants.S_IRUSR | constants.S_IWUSR | constants.S_IRGRP | constants.S_IROTH,
      );
      await rename(partial, target);
    } catch (err) {
      this.setStatus(request, 'import_failed', {
        error: `Cannot import the ebook: ${message(err)}`,
      });
      return;
    }
    const deadline = this.deps.clock().getTime() + settings.importTimeoutMs;
    this.later(WAIT_IMPORT_JOB, { requestId: request.id, deadline });
  }

  /** Tries the next-best release from the same list; no new search. */
  private async next(request: RequestRow, reason: string): Promise<RequestRow> {
    const ranked = this.rank(request).ranked.filter((r) => r.rejected.length === 0);
    const candidate = ranked.find((r) => r.release.status === 'candidate');
    if (!candidate) {
      return this.setStatus(request, 'download_failed', {
        error: `${reason}. No other release left; try another one or search again.`,
      });
    }
    return this.grab(request, candidate.release.id);
  }

  private markFailed(release: ReleaseRow): void {
    this.db.update(releases).set({ status: 'failed' }).where(eq(releases.id, release.id)).run();
  }

  private release(request: RequestRow, id: string): ReleaseRow | undefined {
    return this.db
      .select()
      .from(releases)
      .where(and(eq(releases.id, id), eq(releases.requestId, request.id)))
      .get();
  }

  private find(id: string): RequestRow | undefined {
    return this.db.select().from(requests).where(eq(requests.id, id)).get();
  }

  private later(type: string, payload: unknown): void {
    this.deps.schedule(
      type,
      payload,
      new Date(this.deps.clock().getTime() + this.deps.settings.pollIntervalMs),
    );
  }

  private update(request: RequestRow, set: Partial<RequestRow>): RequestRow {
    return this.db
      .update(requests)
      .set({ ...set, updatedAt: this.deps.clock() })
      .where(eq(requests.id, request.id))
      .returning()
      .get();
  }

  private setStatus(
    request: RequestRow,
    status: RequestStatus,
    set: Partial<Pick<RequestRow, 'error' | 'downloadId' | 'progress' | 'calibreBookId'>> = {},
  ): RequestRow {
    assertTransition(request.status, status);
    return this.update(request, { error: null, ...set, status });
  }
}
