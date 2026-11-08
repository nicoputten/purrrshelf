import type { AssignOwnersRequest, ImportStatus } from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import type { Clock } from '../../clock.js';
import { AppError } from '../../errors.js';
import type { User } from '../../db/schema.js';
import type { LibraryItems } from './items.js';
import { libraryUnavailable } from './errors.js';
import type { LibraryAdapter, LibraryBook } from './types.js';

/** Calibre is read this many books at a time. */
const PAGE = 500;

/** Finds the work a library book is; discover implements it. */
export interface WorkMatcher {
  matchWork(book: { title: string; authors: string[]; isbns: string[] }): Promise<string | null>;
}

export interface ImportUsers {
  list(): User[];
}

type Progress = Omit<ImportStatus, 'readers'>;

const idle: Progress = {
  running: false,
  startedAt: null,
  finishedAt: null,
  scanned: 0,
  added: 0,
  toMatch: 0,
  matched: 0,
  unmatched: 0,
  failed: 0,
};

/**
 * Imports the existing Calibre library (BRK-09). A run gives every Calibre
 * book a library item, then matches books without a work to one, one book
 * at a time in the background (metadata search only, never an indexer).
 * Re-running is safe: items are kept, matched works stay, and only books
 * still without a work are searched again. Owners are set in the review.
 */
export class LibraryImport {
  private progress: Progress = idle;
  private matching: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    private readonly items: LibraryItems,
    private readonly users: ImportUsers,
    private readonly library: LibraryAdapter | null,
    private readonly matcher: WorkMatcher,
    private readonly clock: Clock,
    private readonly log: Pick<FastifyBaseLogger, 'warn'>,
  ) {}

  /** Scans the library and starts matching; while a run is busy it just reports on it. */
  async start(askingUserId: string): Promise<ImportStatus> {
    if (this.progress.running || this.stopped) return this.status(askingUserId);
    const library = this.requireLibrary();
    const startedAt = this.clock();
    const books = await this.scan(library);

    const known = new Set(
      this.items.byCalibreIds(books.map((b) => b.id)).map((i) => i.calibreBookId),
    );
    const toMatch: LibraryBook[] = [];
    for (const book of books) {
      const item = this.items.ensure({ workId: null, calibreBookId: book.id, title: book.title });
      if (!item.workId) toMatch.push(book);
    }
    this.progress = {
      ...idle,
      running: toMatch.length > 0,
      startedAt: startedAt.toISOString(),
      finishedAt: toMatch.length > 0 ? null : this.clock().toISOString(),
      scanned: books.length,
      added: books.filter((b) => !known.has(b.id)).length,
      toMatch: toMatch.length,
    };
    if (toMatch.length > 0) this.matching = this.matchAll(toMatch);
    return this.status(askingUserId);
  }

  status(askingUserId: string): ImportStatus {
    const readers = [...this.users.list()]
      .sort(
        (a, b) =>
          Number(b.id === askingUserId) - Number(a.id === askingUserId) ||
          a.displayName.localeCompare(b.displayName),
      )
      .map((u) => ({ id: u.id, displayName: u.displayName, me: u.id === askingUserId }));
    return { ...this.progress, readers };
  }

  /** Resolves when the running import has matched every book. */
  idle(): Promise<void> {
    return this.matching;
  }

  /** On shutdown: finishes the book being matched and leaves the rest for the next run. */
  stop(): Promise<void> {
    this.stopped = true;
    return this.matching;
  }

  /** Sets the owners of each book, replacing what was there (import review, bulk or per book). */
  assign({ itemIds, ownerIds }: AssignOwnersRequest): { updated: number } {
    const readers = new Set(this.users.list().map((u) => u.id));
    const unknown = ownerIds.find((id) => !readers.has(id));
    if (unknown) {
      throw new AppError(404, 'NOT_FOUND', 'No such reader', { userId: unknown });
    }
    const ids = [...new Set(itemIds)];
    const found = new Set(this.items.byIds(ids).map((i) => i.id));
    const missing = ids.find((id) => !found.has(id));
    if (missing) {
      throw new AppError(404, 'NOT_FOUND', 'This book is not in the library', { itemId: missing });
    }
    this.items.setOwners(ids, [...new Set(ownerIds)]);
    return { updated: ids.length };
  }

  private async scan(library: LibraryAdapter): Promise<LibraryBook[]> {
    const books: LibraryBook[] = [];
    let afterId = 0;
    for (;;) {
      const page = await library.findBooks({ afterId, limit: PAGE });
      books.push(...page);
      const last = page.at(-1);
      if (!last || page.length < PAGE) return books;
      afterId = last.id;
    }
  }

  private async matchAll(books: LibraryBook[]): Promise<void> {
    for (const book of books) {
      if (this.stopped) break;
      try {
        const workId = await this.matcher.matchWork(book);
        if (workId) {
          this.items.ensure({ workId, calibreBookId: book.id, title: book.title });
          this.progress.matched++;
        } else {
          this.progress.unmatched++;
        }
      } catch (err) {
        this.log.warn({ err, calibreBookId: book.id }, 'import: matching a book failed');
        this.progress.failed++;
      }
    }
    this.progress = { ...this.progress, running: false, finishedAt: this.clock().toISOString() };
  }

  private requireLibrary(): LibraryAdapter {
    if (!this.library) throw libraryUnavailable('The library (CWA) is not configured');
    return this.library;
  }
}
