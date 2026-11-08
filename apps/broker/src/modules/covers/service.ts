import type { CoverSize } from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import type { Clock } from '../../clock.js';
import { AppError } from '../../errors.js';
import type { HttpOptions } from '../discover/http.js';
import type { DiscoverService } from '../discover/service.js';
import { fetchImage } from './fetch-image.js';
import type { LibraryCovers } from './library-covers.js';
import { renderPlaceholder } from './placeholder.js';
import { etagOf, type CoverStore } from './store.js';

/** Don't retry a work whose remote covers all failed more often than this. */
const RETRY_AFTER_MS = 60 * 60 * 1000;

export interface Cover {
  body: Buffer;
  etag: string;
  /** `placeholder` is generated and may be replaced by a real cover later. */
  kind: 'library' | 'remote' | 'placeholder';
}

export interface CoverDeps {
  store: CoverStore;
  discover: DiscoverService;
  library: LibraryCovers;
  http: HttpOptions;
  clock: Clock;
  log: Pick<FastifyBaseLogger, 'warn'>;
}

/**
 * Real covers for every book (BRK-07): the Calibre cover for library books,
 * otherwise the first metadata cover that downloads (Hardcover, Open Library,
 * Google Books), stored once on /data in three sizes; else a placeholder card.
 */
export class CoverService {
  private readonly failedAt = new Map<string, number>();

  constructor(private readonly deps: CoverDeps) {}

  async get(workId: string, size: CoverSize): Promise<Cover> {
    const { store } = this.deps;

    const library = await this.deps.library.coverFor(workId);
    if (library) {
      const key = `library:${library.key}`;
      const stored = await store.read(key, size);
      if (stored) return { ...stored, kind: 'library' };
      try {
        await store.write(key, await library.load());
        const fresh = await store.read(key, size);
        if (fresh) return { ...fresh, kind: 'library' };
      } catch (err) {
        this.deps.log.warn({ err, workId }, 'library cover unreadable');
      }
    }

    const remoteKey = `remote:${workId}`;
    const stored = await store.read(remoteKey, size);
    if (stored) return { ...stored, kind: 'remote' };
    if (await this.downloadRemote(workId)) {
      const fresh = await store.read(remoteKey, size);
      if (fresh) return { ...fresh, kind: 'remote' };
    }
    return this.placeholder(workId, size);
  }

  /**
   * The best metadata cover as downloaded, for handing to CWA when a book is
   * imported without a cover of its own. `null` when no provider has one.
   */
  async forImport(workId: string): Promise<Buffer | null> {
    const key = `remote:${workId}`;
    const original = await this.deps.store.original(key);
    if (original) return original;
    return (await this.downloadRemote(workId)) ? this.deps.store.original(key) : null;
  }

  /** Tries each cover URL in provider order; stores the first one that is a real image. */
  private async downloadRemote(workId: string): Promise<boolean> {
    const failed = this.failedAt.get(workId);
    if (failed !== undefined && this.deps.clock().getTime() - failed < RETRY_AFTER_MS) return false;

    let urls: string[];
    try {
      urls = await this.deps.discover.coverUrls(workId);
    } catch (err) {
      if (err instanceof AppError && err.code === 'NOT_FOUND') throw err;
      return false;
    }
    for (const url of urls) {
      try {
        await this.deps.store.write(`remote:${workId}`, await fetchImage(this.deps.http, url));
        this.failedAt.delete(workId);
        return true;
      } catch (err) {
        this.deps.log.warn({ err, workId }, 'cover download failed');
      }
    }
    if (urls.length > 0) this.failedAt.set(workId, this.deps.clock().getTime());
    return false;
  }

  private async placeholder(workId: string, size: CoverSize): Promise<Cover> {
    let title = '';
    let author: string | null = null;
    try {
      const work = await this.deps.discover.workSummary(workId);
      title = work.title;
      author = work.authors[0] ?? null;
    } catch {
      // Metadata is down: a card without a title still beats a broken image.
    }
    const body = await renderPlaceholder(workId, title, author, size);
    return { body, etag: etagOf(body), kind: 'placeholder' };
  }
}
