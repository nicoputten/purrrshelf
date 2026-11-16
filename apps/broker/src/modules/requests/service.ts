import { randomUUID } from 'node:crypto';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { releases, requests, type RequestRow, type RequestStatus } from '../../db/schema.js';
import type { BookQuery } from '../search/planner.js';
import type { IndexerSearch, RunOptions, SearchOutcome } from '../search/service.js';
import { assertTransition, canRetry, canUndoWrongBook, InvalidTransitionError } from './status.js';

/**
 * The one job type that may reach an indexer: resuming the search of a
 * request that waited for budget (CLAUDE.md, ADR 0005).
 */
export const RESUME_SEARCH_JOB = 'resume_waiting_budget_search';

const ResumePayload = z.object({ requestId: z.string() });

const BookQuerySchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()),
  isbn13: z.string().optional(),
  language: z.enum(['en', 'nl']),
  series: z.object({ name: z.string(), position: z.number().nullable() }).optional(),
});

export interface NewRequest {
  userId: string;
  workId: string;
  query: BookQuery;
  pushTo: string[];
  /** `manual`: no search now; the reader searches with their own words (ADR 0048). */
  search?: 'auto' | 'manual';
}

export class RequestNotFoundError extends Error {
  override name = 'RequestNotFoundError';
}

/** Undoing a wrong book needs the library (CWA). */
export class LibraryNotSetUpError extends Error {
  override name = 'LibraryNotSetUpError';
}

export { InvalidTransitionError };

/** The "add a book" lifecycle up to the indexer search (BRK-05). */
/** Schedules a {@link RESUME_SEARCH_JOB} for a request at `runAt`. */
export type ResumeScheduler = (requestId: string, runAt: Date) => void;

/** What happens after a search stored releases: the pick (BRK-06). */
export type OnFound = (request: RequestRow) => Promise<RequestRow>;

/** What happens once the book is in the library: ownership and Kobo shelves (APP-03). */
export type OnInLibrary = (request: RequestRow) => Promise<RequestRow>;

/** Taking a wrong book away again; implemented by the library module (BRK-19). */
export interface WrongBookLibrary {
  /** A book the request imported: off every owner's and reader's Kobo, deleted from the library. */
  discard(calibreBookId: number, readers: string[]): Promise<void>;
  /** A book that was already in the library: only out of this reader's library and Kobos. */
  dropFor(calibreBookId: number, userId: string, readers: string[]): Promise<void>;
}

/** What happens after "Wrong book?" (ADR 0048). */
export type WrongBookNext = 'search_myself' | 'search_again' | 'remove_only';

const NEXT_STATUS: Record<WrongBookNext, RequestStatus> = {
  search_myself: 'choose_release',
  search_again: 'searching',
  remove_only: 'cancelled',
};

export class RequestService {
  constructor(
    private readonly db: Db,
    private readonly search: IndexerSearch,
    private readonly scheduleResume: ResumeScheduler,
    private readonly onFound: OnFound,
    private readonly clock: Clock,
    private readonly onInLibrary: OnInLibrary,
    private readonly notify: (row: RequestRow) => RequestRow,
    /** Null until the library (CWA) is configured. */
    private readonly wrongBookLibrary: WrongBookLibrary | null = null,
  ) {}

  /** Job handler for {@link RESUME_SEARCH_JOB}. */
  readonly resumeJob = async (payload: unknown): Promise<void> => {
    const { requestId } = ResumePayload.parse(payload);
    const request = this.find(requestId);
    // Cancelled or retried by hand in the meantime: nothing to do, nothing spent.
    if (request?.status !== 'waiting_budget') return;
    await this.runSearch(this.setStatus(request, 'searching'));
  };

  get(id: string): RequestRow {
    const row = this.find(id);
    if (!row) throw new RequestNotFoundError(`No request "${id}"`);
    return row;
  }

  /** A user's requests, newest first. */
  list(userId: string, limit = 50): RequestRow[] {
    return this.db
      .select()
      .from(requests)
      .where(eq(requests.userId, userId))
      .orderBy(desc(requests.createdAt), desc(requests.id))
      .limit(limit)
      .all();
  }

  /** The user's request for this work that is still going (or can be retried), if any. */
  findOpen(userId: string, workId: string): RequestRow | undefined {
    return this.db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.userId, userId),
          eq(requests.workId, workId),
          notInArray(requests.status, ['pushed', 'cancelled']),
        ),
      )
      .orderBy(desc(requests.createdAt))
      .get();
  }

  /** A user tapped Add: create the request and search right away. */
  async add(input: NewRequest): Promise<RequestRow> {
    return this.start(input).done;
  }

  /**
   * Like {@link add}, but answers the new request before the search ends, so
   * the app can follow it. `done` settles with the request after the search.
   */
  start(input: NewRequest): { request: RequestRow; done: Promise<RequestRow> } {
    const now = this.clock();
    const query = BookQuerySchema.parse(input.query);
    const manual = input.search === 'manual';
    const row = this.notify(
      this.db
        .insert(requests)
        .values({
          id: randomUUID(),
          userId: input.userId,
          workId: input.workId,
          queryJson: JSON.stringify(query),
          language: query.language,
          mediaType: 'ebook',
          // A manual request waits for the reader's words in the pick step.
          status: manual ? 'choose_release' : 'searching',
          pushToJson: JSON.stringify(input.pushTo),
          searchStartedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get(),
    );
    return { request: row, done: manual ? Promise.resolve(row) : this.runSearch(row) };
  }

  /**
   * "Search it yourself" (BRK-18): one search with the reader's words on one
   * indexer. With results the request waits in choose_release for the reader
   * to pick; with none it stays as it was. Allowed where Try again is.
   */
  async searchByHand(
    id: string,
    indexerId: string,
    words: string,
  ): Promise<{ request: RequestRow; resultCount: number }> {
    const request = this.get(id);
    if (!canRetry(request.status)) throw new InvalidTransitionError(request.status, 'searching');
    const query = BookQuerySchema.parse(JSON.parse(request.queryJson));
    const resultCount = await this.search.manual(request, query, indexerId, words);
    if (resultCount === 0) return { request, resultCount };
    // The status may have moved while the indexer answered (a cancel): only go on from where we were.
    const current = this.get(id);
    if (current.status !== request.status) return { request: current, resultCount };
    const searching = this.setStatus(current, 'searching');
    return { request: this.setStatus(searching, 'choose_release'), resultCount };
  }

  /**
   * "Wrong book?" (BRK-19, ADR 0048): the book leaves the Kobos (and the
   * library, when this request imported it), its release is never picked
   * again, and the request goes on as the reader chose. Answers once the
   * book is gone; `done` settles after a new search round.
   */
  async wrongBook(
    id: string,
    then: WrongBookNext,
  ): Promise<{ request: RequestRow; done: Promise<RequestRow> }> {
    const request = this.get(id);
    const next = NEXT_STATUS[then];
    if (!canUndoWrongBook(request.status) || request.calibreBookId === null) {
      throw new InvalidTransitionError(request.status, next);
    }
    if (!this.wrongBookLibrary) {
      throw new LibraryNotSetUpError('The library is not set up yet');
    }
    const grabbed = this.db
      .select({ id: releases.id })
      .from(releases)
      .where(and(eq(releases.requestId, id), eq(releases.status, 'grabbed')))
      .all();
    const readers = [request.userId, ...(JSON.parse(request.pushToJson) as string[])];
    // A grabbed release means this request brought the book in, so it goes.
    if (grabbed.length > 0) {
      await this.wrongBookLibrary.discard(request.calibreBookId, readers);
    } else {
      await this.wrongBookLibrary.dropFor(request.calibreBookId, request.userId, readers);
    }
    this.db
      .update(releases)
      .set({ status: 'failed' })
      .where(and(eq(releases.requestId, id), eq(releases.status, 'grabbed')))
      .run();
    // The book may have moved on while CWA answered; only go on from where we were.
    const current = this.get(id);
    assertTransition(current.status, next);
    const now = this.clock();
    const row = this.notify(
      this.db
        .update(requests)
        .set({
          status: next,
          calibreBookId: null,
          downloadId: null,
          progress: null,
          error: null,
          updatedAt: now,
          ...(next === 'searching' ? { searchStartedAt: now } : {}),
        })
        .where(eq(requests.id, id))
        .returning()
        .get(),
    );
    const done =
      next === 'searching' ? this.runSearch(row, { skipLibrary: true }) : Promise.resolve(row);
    return { request: row, done };
  }

  /** "Try again": a new, paid search round. */
  async retry(id: string): Promise<RequestRow> {
    return this.startRetry(id).done;
  }

  /** Like {@link retry}, but answers once the round has started. */
  startRetry(id: string): { request: RequestRow; done: Promise<RequestRow> } {
    const request = this.get(id);
    if (!canRetry(request.status)) throw new InvalidTransitionError(request.status, 'searching');
    const now = this.clock();
    const row = this.notify(
      this.db
        .update(requests)
        .set({ status: 'searching', searchStartedAt: now, updatedAt: now, error: null })
        .where(eq(requests.id, id))
        .returning()
        .get(),
    );
    return { request: row, done: this.runSearch(row) };
  }

  cancel(id: string): RequestRow {
    return this.setStatus(this.get(id), 'cancelled');
  }

  find(id: string): RequestRow | undefined {
    return this.db.select().from(requests).where(eq(requests.id, id)).get();
  }

  private async runSearch(request: RequestRow, options: RunOptions = {}): Promise<RequestRow> {
    let outcome: SearchOutcome;
    try {
      outcome = await this.search.run(
        request,
        BookQuerySchema.parse(JSON.parse(request.queryJson)),
        options,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.setStatus(request, 'not_found', { error: message });
    }
    switch (outcome.kind) {
      case 'in_library':
        return this.onInLibrary(
          this.setStatus(request, 'in_library', { calibreBookId: outcome.calibreBookId }),
        );
      case 'found':
        return this.onFound(request);
      case 'not_found':
        return this.setStatus(request, 'not_found', { error: outcome.reason });
      case 'waiting_budget': {
        const row = this.setStatus(request, 'waiting_budget');
        this.scheduleResume(row.id, outcome.nextFreeAt);
        return row;
      }
    }
  }

  private setStatus(
    request: RequestRow,
    status: RequestStatus,
    extra: { error?: string; calibreBookId?: number } = {},
  ): RequestRow {
    assertTransition(request.status, status);
    return this.notify(
      this.db
        .update(requests)
        .set({
          status,
          updatedAt: this.clock(),
          error: extra.error ?? null,
          ...('calibreBookId' in extra ? { calibreBookId: extra.calibreBookId } : {}),
        })
        .where(eq(requests.id, request.id))
        .returning()
        .get(),
    );
  }
}
