import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { requests, type RequestRow, type RequestStatus } from '../../db/schema.js';
import type { BookQuery } from '../search/planner.js';
import type { IndexerSearch, SearchOutcome } from '../search/service.js';
import { assertTransition, canRetry, InvalidTransitionError } from './status.js';

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
});

export interface NewRequest {
  userId: string;
  workId: string;
  query: BookQuery;
  pushTo: string[];
}

export class RequestNotFoundError extends Error {
  override name = 'RequestNotFoundError';
}

export { InvalidTransitionError };

/** The "add a book" lifecycle up to the indexer search (BRK-05). */
/** Schedules a {@link RESUME_SEARCH_JOB} for a request at `runAt`. */
export type ResumeScheduler = (requestId: string, runAt: Date) => void;

/** What happens after a search stored releases: the pick (BRK-06). */
export type OnFound = (request: RequestRow) => Promise<RequestRow>;

export class RequestService {
  constructor(
    private readonly db: Db,
    private readonly search: IndexerSearch,
    private readonly scheduleResume: ResumeScheduler,
    private readonly onFound: OnFound,
    private readonly clock: Clock,
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

  /** A user tapped Add: create the request and search right away. */
  async add(input: NewRequest): Promise<RequestRow> {
    const now = this.clock();
    const query = BookQuerySchema.parse(input.query);
    const row = this.db
      .insert(requests)
      .values({
        id: randomUUID(),
        userId: input.userId,
        workId: input.workId,
        queryJson: JSON.stringify(query),
        language: query.language,
        mediaType: 'ebook',
        status: 'searching',
        pushToJson: JSON.stringify(input.pushTo),
        searchStartedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return this.runSearch(row);
  }

  /** "Try again": a new, paid search round. */
  async retry(id: string): Promise<RequestRow> {
    const request = this.get(id);
    if (!canRetry(request.status)) throw new InvalidTransitionError(request.status, 'searching');
    const now = this.clock();
    const row = this.db
      .update(requests)
      .set({ status: 'searching', searchStartedAt: now, updatedAt: now, error: null })
      .where(eq(requests.id, id))
      .returning()
      .get();
    return this.runSearch(row);
  }

  cancel(id: string): RequestRow {
    return this.setStatus(this.get(id), 'cancelled');
  }

  private find(id: string): RequestRow | undefined {
    return this.db.select().from(requests).where(eq(requests.id, id)).get();
  }

  private async runSearch(request: RequestRow): Promise<RequestRow> {
    let outcome: SearchOutcome;
    try {
      outcome = await this.search.run(
        request,
        BookQuerySchema.parse(JSON.parse(request.queryJson)),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.setStatus(request, 'not_found', { error: message });
    }
    switch (outcome.kind) {
      case 'in_library':
        return this.setStatus(request, 'in_library', { calibreBookId: outcome.calibreBookId });
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
    return this.db
      .update(requests)
      .set({
        status,
        updatedAt: this.clock(),
        error: extra.error ?? null,
        ...('calibreBookId' in extra ? { calibreBookId: extra.calibreBookId } : {}),
      })
      .where(eq(requests.id, request.id))
      .returning()
      .get();
  }
}
