import { and, asc, eq, gt, lte } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import {
  budgetBlocks,
  budgetEvents,
  indexers,
  type BudgetKind,
  type Indexer,
} from '../../db/schema.js';

/** The indexer's limits are per rolling hour (ADR 0005). */
export const BUDGET_WINDOW_MS = 60 * 60_000;
/** Events older than this are no longer needed for the window and are pruned. */
const RETENTION_MS = 24 * 60 * 60_000;

export interface BudgetStatus {
  limit: number;
  used: number;
  left: number;
  /** When the next call may be spent: now if there is room and no block. */
  nextFreeAt: Date;
  /** Set while the indexer's own "limit reached" block is active. */
  limitReachedUntil: Date | null;
}

export interface IndexerBudgetOverview {
  indexer: Indexer;
  search: BudgetStatus;
  grab: BudgetStatus;
}

export class UnknownIndexerError extends Error {
  override name = 'UnknownIndexerError';
  constructor(public readonly indexerId: string) {
    super(`Unknown indexer "${indexerId}"`);
  }
}

/** No room in the window (or the indexer blocked us); nothing was sent. */
export class BudgetExhaustedError extends Error {
  override name = 'BudgetExhaustedError';
  constructor(
    public readonly indexerId: string,
    public readonly kind: BudgetKind,
    public readonly nextFreeAt: Date,
  ) {
    super(`No ${kind} budget left on indexer "${indexerId}" until ${nextFreeAt.toISOString()}`);
  }
}

/**
 * Thrown by an indexer client when the indexer itself says its limit is
 * reached (Newznab error 500/501). The budget then stops spending on that
 * counter until `retryAt`, or for a full window when the indexer gives no time.
 */
export class IndexerLimitReachedError extends Error {
  override name = 'IndexerLimitReachedError';
  constructor(
    message: string,
    public readonly retryAt?: Date,
  ) {
    super(message);
  }
}

/**
 * The only gate to an indexer. Every search and NZB grab runs through
 * {@link IndexerBudget.spend}, which checks the rolling window, records the
 * call and only then lets it go out.
 */
export class IndexerBudget {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  status(indexerId: string, kind: BudgetKind): BudgetStatus {
    return this.compute(this.indexer(indexerId), kind, this.clock());
  }

  /** Every indexer, in priority order, with both counters. */
  overview(): IndexerBudgetOverview[] {
    const now = this.clock();
    return this.db
      .select()
      .from(indexers)
      .orderBy(asc(indexers.priority), asc(indexers.id))
      .all()
      .map((indexer) => ({
        indexer,
        search: this.compute(indexer, 'search', now),
        grab: this.compute(indexer, 'grab', now),
      }));
  }

  /**
   * Spends one call of `kind` on the indexer and runs `call`. Throws
   * {@link BudgetExhaustedError} without running it when there is no room.
   * A call that fails still counts: the request went out.
   */
  async spend<T>(indexerId: string, kind: BudgetKind, call: () => Promise<T>): Promise<T> {
    const indexer = this.indexer(indexerId);
    // better-sqlite3 transactions are synchronous, so check + record is atomic.
    this.db.transaction((tx) => {
      const now = this.clock();
      const status = this.compute(indexer, kind, now, tx);
      if (status.left === 0) throw new BudgetExhaustedError(indexerId, kind, status.nextFreeAt);
      tx.insert(budgetEvents).values({ indexerId, kind, at: now }).run();
      tx.delete(budgetEvents)
        .where(lte(budgetEvents.at, new Date(now.getTime() - RETENTION_MS)))
        .run();
    });
    try {
      return await call();
    } catch (err) {
      if (err instanceof IndexerLimitReachedError) {
        this.reportLimitReached(indexerId, kind, err.message, err.retryAt);
      }
      throw err;
    }
  }

  /** Stops spending on this counter until `until` (default: one full window from now). */
  reportLimitReached(indexerId: string, kind: BudgetKind, reason: string, until?: Date): void {
    this.indexer(indexerId);
    const now = this.clock().getTime();
    const end = until && until.getTime() > now ? until : new Date(now + BUDGET_WINDOW_MS);
    this.db
      .insert(budgetBlocks)
      .values({ indexerId, kind, until: end, reason })
      .onConflictDoUpdate({
        target: [budgetBlocks.indexerId, budgetBlocks.kind],
        set: { until: end, reason },
      })
      .run();
  }

  private indexer(id: string): Indexer {
    const row = this.db.select().from(indexers).where(eq(indexers.id, id)).get();
    if (!row) throw new UnknownIndexerError(id);
    return row;
  }

  private compute(indexer: Indexer, kind: BudgetKind, now: Date, db: Db = this.db): BudgetStatus {
    const limit = kind === 'search' ? indexer.searchLimitPerHour : indexer.grabLimitPerHour;
    const windowStart = new Date(now.getTime() - BUDGET_WINDOW_MS);
    const times = db
      .select({ at: budgetEvents.at })
      .from(budgetEvents)
      .where(
        and(
          eq(budgetEvents.indexerId, indexer.id),
          eq(budgetEvents.kind, kind),
          gt(budgetEvents.at, windowStart),
        ),
      )
      .orderBy(asc(budgetEvents.at))
      .all()
      .map((e) => e.at.getTime());
    const block = db
      .select({ until: budgetBlocks.until })
      .from(budgetBlocks)
      .where(
        and(
          eq(budgetBlocks.indexerId, indexer.id),
          eq(budgetBlocks.kind, kind),
          gt(budgetBlocks.until, now),
        ),
      )
      .get();

    const used = times.length;
    const roomLeft = Math.max(0, limit - used);
    // A slot frees once the oldest (used - limit + 1) calls have left the window.
    const mustLeave = times.slice(0, Math.max(0, used - limit + 1));
    const windowFreeAt = Math.max(now.getTime(), ...mustLeave.map((t) => t + BUDGET_WINDOW_MS));
    const blockedUntil = block?.until ?? null;
    const nextFreeAt = Math.max(windowFreeAt, blockedUntil?.getTime() ?? 0);
    return {
      limit,
      used,
      left: blockedUntil ? 0 : roomLeft,
      nextFreeAt: new Date(nextFreeAt),
      limitReachedUntil: blockedUntil,
    };
  }
}
