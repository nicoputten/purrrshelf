import { randomUUID } from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { releases, searchAttempts, type Indexer, type RequestRow } from '../../db/schema.js';
import { BudgetExhaustedError, IndexerLimitReachedError } from '../budget/budget.js';
import type { IndexerGateway, NewznabCaps, NewznabItem } from '../budget/gateway.js';
import type { IndexerRepository } from '../indexers/repository.js';
import type { ReleaseJudge } from './judge.js';
import {
  orderByHitRate,
  variantsFor,
  type BookQuery,
  type VariantId,
  type VariantStats,
} from './planner.js';

/** What the library knows about a book; implemented by the library adapter (BRK-03). */
export interface LibraryLookup {
  findBook: (query: BookQuery) => Promise<{ calibreBookId: number } | null>;
}

export type SearchOutcome =
  | { kind: 'in_library'; calibreBookId: number }
  | { kind: 'found'; indexerId: string; releaseCount: number }
  | { kind: 'not_found'; reason: string }
  | { kind: 'waiting_budget'; nextFreeAt: Date };

function guessFormat(title: string): string | null {
  const m = title.toLowerCase().match(/\b(epub|azw3|mobi|pdf|cbz|cbr|kepub)\b/);
  return m?.[1] ?? null;
}

/**
 * Plans and runs the indexer search for one request: library first, then
 * indexers in priority order (never in parallel), query variants one at a
 * time by hit rate, stopping at the first acceptable hit.
 */
export class IndexerSearch {
  constructor(
    private readonly db: Db,
    private readonly gateway: IndexerGateway,
    private readonly indexers: IndexerRepository,
    private readonly library: LibraryLookup,
    private readonly judge: ReleaseJudge,
    private readonly clock: Clock,
  ) {}

  async run(request: RequestRow, query: BookQuery): Promise<SearchOutcome> {
    const owned = await this.library.findBook(query);
    if (owned) return { kind: 'in_library', calibreBookId: owned.calibreBookId };

    // A search limit of 0 switches an indexer off.
    const indexers = this.indexers.list().filter((i) => i.searchLimitPerHour > 0);
    if (indexers.length === 0) return { kind: 'not_found', reason: 'No indexer is configured' };

    const tried = this.triedThisRound(request);
    let nextFreeAt: Date | undefined;
    for (const indexer of indexers) {
      const outcome = await this.searchIndexer(request, query, indexer, tried);
      if (outcome.kind === 'found') return outcome;
      if (outcome.kind === 'waiting_budget') {
        nextFreeAt =
          nextFreeAt && nextFreeAt <= outcome.nextFreeAt ? nextFreeAt : outcome.nextFreeAt;
      }
    }
    if (nextFreeAt) return { kind: 'waiting_budget', nextFreeAt };
    return { kind: 'not_found', reason: 'No acceptable release on any indexer' };
  }

  private async searchIndexer(
    request: RequestRow,
    query: BookQuery,
    indexer: Indexer,
    tried: Set<string>,
  ): Promise<SearchOutcome | { kind: 'exhausted_variants' }> {
    const caps = indexer.capsJson ? (JSON.parse(indexer.capsJson) as NewznabCaps) : null;
    const variants = orderByHitRate(variantsFor(query, caps), this.stats(indexer.id));
    for (const variant of variants) {
      if (tried.has(`${indexer.id}:${variant.id}`)) continue;
      let items: NewznabItem[];
      try {
        items = await this.gateway.search(indexer, variant.params);
      } catch (err) {
        if (err instanceof BudgetExhaustedError) {
          return { kind: 'waiting_budget', nextFreeAt: err.nextFreeAt };
        }
        // The call went out (or the key is missing): record it and give up on this indexer.
        // The gateway only throws Error subclasses.
        const message = (err as Error).message;
        this.record(request, indexer, variant.id, variant.label, 0, false, message);
        if (err instanceof IndexerLimitReachedError) {
          return { kind: 'waiting_budget', nextFreeAt: this.gateway.nextFreeSearch(indexer) };
        }
        return { kind: 'exhausted_variants' };
      }
      const acceptable = items.filter((i) => this.judge.acceptable(query, i));
      this.record(request, indexer, variant.id, variant.label, items.length, acceptable.length > 0);
      if (acceptable.length > 0) {
        this.storeReleases(request, indexer, items);
        return { kind: 'found', indexerId: indexer.id, releaseCount: items.length };
      }
    }
    return { kind: 'exhausted_variants' };
  }

  /** Variant/indexer pairs already spent since this search round began. */
  private triedThisRound(request: RequestRow): Set<string> {
    const rows = this.db
      .select({ indexerId: searchAttempts.indexerId, variant: searchAttempts.variant })
      .from(searchAttempts)
      .where(
        and(
          eq(searchAttempts.requestId, request.id),
          gte(searchAttempts.createdAt, request.searchStartedAt),
        ),
      )
      .all();
    return new Set(rows.map((r) => `${r.indexerId}:${r.variant}`));
  }

  private stats(indexerId: string): Map<VariantId, VariantStats> {
    const rows = this.db
      .select({
        variant: searchAttempts.variant,
        attempts: sql<number>`count(*)`,
        hits: sql<number>`sum(${searchAttempts.hit})`,
      })
      .from(searchAttempts)
      .where(and(eq(searchAttempts.indexerId, indexerId), sql`${searchAttempts.error} is null`))
      .groupBy(searchAttempts.variant)
      .all();
    return new Map(
      rows.map((r) => [r.variant as VariantId, { attempts: r.attempts, hits: r.hits }]),
    );
  }

  private record(
    request: RequestRow,
    indexer: Indexer,
    variant: VariantId,
    query: string,
    resultCount: number,
    hit: boolean,
    error: string | null = null,
  ): void {
    this.db
      .insert(searchAttempts)
      .values({
        requestId: request.id,
        indexerId: indexer.id,
        variant,
        query,
        resultCount,
        hit,
        cost: 1,
        error,
        createdAt: this.clock(),
      })
      .run();
  }

  private storeReleases(request: RequestRow, indexer: Indexer, items: NewznabItem[]): void {
    const now = this.clock();
    // A new search replaces the candidates of an earlier one; failed releases stay remembered.
    this.db
      .delete(releases)
      .where(and(eq(releases.requestId, request.id), eq(releases.status, 'candidate')))
      .run();
    for (const item of items) {
      this.db
        .insert(releases)
        .values({
          id: randomUUID(),
          requestId: request.id,
          indexerId: indexer.id,
          guid: item.guid,
          title: item.title,
          size: item.size,
          category: item.category,
          format: guessFormat(item.title),
          language: item.language,
          grabs: item.grabs,
          publishedAt: item.publishedAt,
          createdAt: now,
        })
        .run();
    }
  }
}
