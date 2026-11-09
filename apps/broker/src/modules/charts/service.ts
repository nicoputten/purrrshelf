import type { Chart, ChartGenre, ChartRegion, Charts, WorkSummary } from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import type { Clock } from '../../clock.js';
import type { User } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import type { LibraryLookup } from '../discover/library-lookup.js';
import type { OpenRequests } from '../recommend/types.js';
import type { AppleEntry } from './apple.js';
import { appleGenres, hardcoverGenres, splitByGenre } from './genres.js';

/** Books per genre list. */
export const PER_LIST = 10;
/** Hardcover trending ids asked for; genre lists are cut from these. */
export const TRENDING_SIZE = 100;
/** A chart is fetched again when it is older than this (Apple updates daily). */
export const REFRESH_MS = 24 * 60 * 60 * 1000;
/** Apple books matched to a work at the same time (keeps provider calls polite). */
const MATCH_CONCURRENCY = 3;

/** One chart source as cached: the lists, without anything per reader. */
export interface CachedChart {
  fetchedAt: string;
  lists: {
    genre: ChartGenre;
    items: { rank: number; title: string; authors: string[]; work: WorkSummary | null }[];
  }[];
}

/** Where chart books come from. Metadata only: never an indexer (ADR 0005, ADR 0039). */
export interface ChartWorks {
  /** Throws METADATA_UNAVAILABLE when no provider answered. */
  matchWork(book: { title: string; authors: string[]; isbns: string[] }): Promise<string | null>;
  summary(workId: string): Promise<WorkSummary>;
  /** Throws METADATA_UNAVAILABLE when Hardcover is not set up or failed. */
  trending(limit: number): Promise<{ work: WorkSummary; tags: string[] }[]>;
  /** False when the server has no Hardcover token: there is no trending chart then. */
  readonly hasTrending: boolean;
}

export interface ChartDeps {
  users: { findById(id: string): User | undefined };
  apple: (region: ChartRegion) => Promise<AppleEntry[]>;
  works: ChartWorks;
  library: LibraryLookup;
  openRequests: OpenRequests;
  cache: { get<T>(key: string): T | undefined; set(key: string, value: unknown): void };
  clock: Clock;
  log: Pick<FastifyBaseLogger, 'warn'>;
}

type SourceKey = { source: 'apple'; region: ChartRegion } | { source: 'hardcover'; region: null };

const cacheKey = (s: SourceKey) => `charts:${s.source}:${s.region ?? 'all'}`;

function unavailable(): AppError {
  return new AppError(502, 'METADATA_UNAVAILABLE', 'Book charts are not available right now');
}

/**
 * Top 10s by genre (BRK-12, ADR 0039): the Apple Books ebook bestsellers of
 * the Netherlands and the US, and Hardcover trending. Charts are fetched at
 * most once a day, when a reader looks; there is no timer. Nothing here
 * reaches an indexer, so looking is free.
 */
export class ChartService {
  private readonly inFlight = new Map<
    string,
    Promise<{ chart: CachedChart; stale: boolean } | null>
  >();

  constructor(private readonly deps: ChartDeps) {}

  async get(userId: string): Promise<Charts> {
    const user = this.deps.users.findById(userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');

    const sources: SourceKey[] = regionsFor(user.locale).map((region) => ({
      source: 'apple' as const,
      region,
    }));
    if (this.deps.works.hasTrending) sources.push({ source: 'hardcover', region: null });

    // One source at a time: matching books to works is the slow part, and
    // Hardcover allows 60 calls a minute.
    const loaded: { key: SourceKey; chart: CachedChart; stale: boolean }[] = [];
    for (const key of sources) {
      const got = await this.load(key);
      if (got) loaded.push({ key, ...got });
    }
    if (loaded.length === 0) throw unavailable();

    const works = loaded.flatMap((l) =>
      l.chart.lists.flatMap((list) => list.items.flatMap((i) => (i.work ? [i.work] : []))),
    );
    const library = await this.deps.library.match(
      userId,
      [...new Map(works.map((w) => [w.id, w])).values()].map((w) => ({
        key: w.id,
        isbns: w.isbns,
        title: w.title,
        authors: w.authors,
      })),
    );
    const requests = this.deps.openRequests(userId);

    const charts: Chart[] = loaded.flatMap(({ key, chart }) =>
      chart.lists.map((list) => ({
        source: key.source,
        region: key.region,
        genre: list.genre,
        items: list.items.map((i) => ({
          rank: i.rank,
          title: i.title,
          authors: i.authors,
          work: i.work ? { ...i.work, library: library.get(i.work.id) ?? null } : null,
          request: i.work ? (requests.get(i.work.id) ?? null) : null,
        })),
      })),
    );
    const oldest = Math.min(...loaded.map((l) => Date.parse(l.chart.fetchedAt)));
    return {
      charts,
      updatedAt: new Date(oldest).toISOString(),
      stale: loaded.some((l) => l.stale),
    };
  }

  /** The cached chart when fresh, else a new one; the last good one when the source is down. */
  private load(key: SourceKey): Promise<{ chart: CachedChart; stale: boolean } | null> {
    const k = cacheKey(key);
    const running = this.inFlight.get(k);
    if (running) return running;
    const promise = this.refresh(key).finally(() => this.inFlight.delete(k));
    this.inFlight.set(k, promise);
    return promise;
  }

  private async refresh(key: SourceKey): Promise<{ chart: CachedChart; stale: boolean } | null> {
    const k = cacheKey(key);
    const cached = this.deps.cache.get<CachedChart>(k);
    const now = this.deps.clock();
    if (cached && now.getTime() - Date.parse(cached.fetchedAt) < REFRESH_MS) {
      return { chart: cached, stale: false };
    }
    try {
      const lists =
        key.source === 'apple' ? await this.appleLists(key.region) : await this.trendingLists();
      const chart: CachedChart = { fetchedAt: now.toISOString(), lists };
      this.deps.cache.set(k, chart);
      return { chart, stale: false };
    } catch (err) {
      this.deps.log.warn({ err, chart: k }, 'charts: refresh failed');
      return cached ? { chart: cached, stale: true } : null;
    }
  }

  private async appleLists(region: ChartRegion): Promise<CachedChart['lists']> {
    const entries = (await this.deps.apple(region)).map((e) => ({
      ...e,
      genres: appleGenres(e.genreIds),
    }));
    const lists = splitByGenre(entries, PER_LIST);

    // Only books that made a list are matched; the same book in several lists once.
    const shown = [...new Set(lists.flatMap((l) => l.items.map((i) => i.entry)))];
    const works = new Map<AppleEntry, WorkSummary | null>();
    let answered = 0;
    let failed = 0;
    const queue = [...shown];
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        try {
          const id = await this.deps.works.matchWork({
            title: entry.title,
            authors: entry.authors,
            isbns: [],
          });
          works.set(entry, id ? await this.deps.works.summary(id) : null);
          answered++;
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          if (err.code === 'METADATA_UNAVAILABLE') failed++;
          else answered++;
          works.set(entry, null);
        }
      }
    };
    await Promise.all(Array.from({ length: MATCH_CONCURRENCY }, worker));
    // Every lookup failed: the providers are down. Keep the last good chart (with covers).
    if (failed > 0 && answered === 0) throw unavailable();

    return lists.map((l) => ({
      genre: l.genre,
      items: l.items.map(({ rank, entry }) => ({
        rank,
        title: entry.title,
        authors: entry.authors,
        work: works.get(entry) ?? null,
      })),
    }));
  }

  private async trendingLists(): Promise<CachedChart['lists']> {
    const trending = (await this.deps.works.trending(TRENDING_SIZE)).map((t) => ({
      work: t.work,
      genres: hardcoverGenres(t.tags),
    }));
    return splitByGenre(trending, PER_LIST).map((l) => ({
      genre: l.genre,
      items: l.items.map(({ rank, entry }) => ({
        rank,
        title: entry.work.title,
        authors: entry.work.authors,
        work: entry.work,
      })),
    }));
  }
}

/** Apple charts for a reader: their own language's country first, then the other. */
export function regionsFor(locale: string): ChartRegion[] {
  return locale.toLowerCase().startsWith('nl') ? ['nl', 'us'] : ['us', 'nl'];
}
