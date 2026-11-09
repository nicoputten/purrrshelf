import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import {
  recommendationCache,
  recommendationDismissals,
  type DismissalKind,
  type RecommendationDismissalRow,
} from '../../db/schema.js';
import type { ComputedRows } from './types.js';

/** "Fewer by this author" counts for this long, then the author is back to normal (ADR 0035). */
export const AUTHOR_DISMISSAL_MS = 90 * 24 * 60 * 60 * 1000;

export interface NewDismissal {
  kind: DismissalKind;
  key: string;
  workId: string;
  author: string | null;
}

/** A reader's "Not for me" and "Fewer by this author" choices. */
export class Dismissals {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** Records (or renews) a dismissal. Author dismissals expire; book dismissals don't. */
  add(userId: string, input: NewDismissal): RecommendationDismissalRow {
    const now = this.clock();
    const row: RecommendationDismissalRow = {
      userId,
      ...input,
      createdAt: now,
      expiresAt: input.kind === 'author' ? new Date(now.getTime() + AUTHOR_DISMISSAL_MS) : null,
    };
    this.db.transaction((tx) => {
      // Expired author rows are no longer needed.
      tx.delete(recommendationDismissals).where(lte(recommendationDismissals.expiresAt, now)).run();
      tx.insert(recommendationDismissals)
        .values(row)
        .onConflictDoUpdate({
          target: [
            recommendationDismissals.userId,
            recommendationDismissals.kind,
            recommendationDismissals.key,
          ],
          set: { workId: row.workId, author: row.author, createdAt: now, expiresAt: row.expiresAt },
        })
        .run();
    });
    return row;
  }

  /** Undo: forgets every dismissal made from this book. */
  removeByWork(userId: string, workId: string): number {
    return this.db
      .delete(recommendationDismissals)
      .where(
        and(
          eq(recommendationDismissals.userId, userId),
          eq(recommendationDismissals.workId, workId),
        ),
      )
      .run().changes;
  }

  /** Dismissals that still count. */
  active(userId: string): RecommendationDismissalRow[] {
    return this.db
      .select()
      .from(recommendationDismissals)
      .where(
        and(
          eq(recommendationDismissals.userId, userId),
          or(
            isNull(recommendationDismissals.expiresAt),
            gt(recommendationDismissals.expiresAt, this.clock()),
          ),
        ),
      )
      .all();
  }
}

export interface CachedRows {
  fingerprint: string;
  rows: ComputedRows;
  computedAt: Date;
}

/** The last computed series and author rows per reader. */
export class RowCache {
  constructor(private readonly db: Db) {}

  get(userId: string): CachedRows | null {
    const row = this.db
      .select()
      .from(recommendationCache)
      .where(eq(recommendationCache.userId, userId))
      .get();
    if (!row) return null;
    return {
      fingerprint: row.fingerprint,
      rows: JSON.parse(row.rowsJson) as ComputedRows,
      computedAt: row.computedAt,
    };
  }

  set(userId: string, cached: CachedRows): void {
    const values = {
      userId,
      fingerprint: cached.fingerprint,
      rowsJson: JSON.stringify(cached.rows),
      computedAt: cached.computedAt,
    };
    this.db
      .insert(recommendationCache)
      .values(values)
      .onConflictDoUpdate({ target: recommendationCache.userId, set: values })
      .run();
  }
}
