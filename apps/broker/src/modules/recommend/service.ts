import type {
  Dismissal,
  DismissKind,
  MetadataProviderName,
  Recommendation,
  RecommendationRow,
  Recommendations,
  WorkSummary,
} from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import type { Clock } from '../../clock.js';
import type { User } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import { authorKey, workKey } from '../discover/normalise.js';
import {
  authorSeeds,
  fingerprint,
  inLanguages,
  isNew,
  readerLanguages,
  seriesSeeds,
} from './seeds.js';
import type { CachedRows, Dismissals, RowCache } from './store.js';
import type {
  Candidate,
  ComputedRows,
  LibraryMatcher,
  OpenRequests,
  ReaderBook,
  ReaderShelfBooks,
  WorkSource,
} from './types.js';

/** Books shown per row (design: max 10 cards). */
export const PER_ROW = 10;
/** Kept per cached row, so a few dismissals don't empty it before the next refresh. */
const CACHED_PER_ROW = 20;
/** Series and authors looked up per refresh; keeps a refresh to a few dozen cached provider calls. */
const MAX_SERIES = 15;
const MAX_AUTHORS = 8;
/** Books per author in the author row, so one author does not fill it. */
const PER_AUTHOR = 3;
/** Partner books looked up per answer. */
const PARTNER_CANDIDATES = 15;
/** Series and author rows are reused this long unless what they were built from changed. */
export const REFRESH_MS = 24 * 60 * 60 * 1000;

export interface RecommendDeps {
  users: { findById(id: string): User | undefined; list(): User[] };
  shelf: { books(user: User): Promise<ReaderShelfBooks> };
  works: WorkSource;
  library: LibraryMatcher;
  openRequests: OpenRequests;
  dismissals: Dismissals;
  cache: RowCache;
  clock: Clock;
  log: Pick<FastifyBaseLogger, 'warn'>;
}

function unavailable(): AppError {
  return new AppError(502, 'METADATA_UNAVAILABLE', 'Book search is not available right now');
}

/** Counts metadata lookups that answered and that could not reach any provider. */
class Lookups {
  answered = 0;
  failed = 0;

  async try<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      const result = await fn();
      this.answered++;
      return result;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      if (err.code === 'METADATA_UNAVAILABLE') this.failed++;
      else this.answered++;
      return null;
    }
  }

  /** Every lookup failed: the providers are down, not just quiet. */
  get down(): boolean {
    return this.failed > 0 && this.answered === 0;
  }
}

/**
 * For you (BRK-11, ADR 0035): next in my series, more from authors I read,
 * and books on my partner's shelf. Built from the library and the metadata
 * providers only; it never reaches an indexer, so looking is free.
 */
export class RecommendService {
  constructor(private readonly deps: RecommendDeps) {}

  async get(userId: string): Promise<Recommendations> {
    const user = this.requireUser(userId);
    const now = this.deps.clock();
    const mine = await this.deps.shelf.books(user);
    const languages = readerLanguages(mine.books, mine.readingData, user.locale);
    const print = fingerprint(mine.books, mine.readingData, languages);

    const cached = this.deps.cache.get(userId);
    let computed: CachedRows | null =
      cached &&
      cached.fingerprint === print &&
      now.getTime() - cached.computedAt.getTime() < REFRESH_MS
        ? cached
        : null;
    let stale = false;
    if (!computed) {
      const lookups = new Lookups();
      const rows = await this.compute(user, mine, languages, lookups);
      if (lookups.down) {
        this.deps.log.warn({ userId }, 'recommendations: metadata providers unavailable');
        stale = true;
        computed = cached;
      } else {
        computed = { fingerprint: print, rows, computedAt: now };
        this.deps.cache.set(userId, computed);
      }
    }

    const partners = await this.partnerRows(user, mine.books, languages);
    if (!computed && partners.every((p) => p.items.length === 0)) throw unavailable();

    const rows = computed?.rows ?? { nextInSeries: [], author: [] };
    return {
      rows: await this.present(user, now, [
        { kind: 'next_in_series', partner: null, items: rows.nextInSeries },
        { kind: 'author', partner: null, items: rows.author },
        ...partners,
      ]),
      readingData: mine.readingData,
      computedAt: (computed?.computedAt ?? now).toISOString(),
      stale,
    };
  }

  /** "Not for me" (`book`) or "Fewer by this author" (`author`). */
  async dismiss(userId: string, workId: string, kind: DismissKind): Promise<Dismissal> {
    this.requireUser(userId);
    let work: { title: string; authors: string[] } | null = null;
    try {
      work = await this.deps.works.workSummary(workId);
    } catch (err) {
      // Hiding one book works without the providers: it is then matched by id only.
      if (kind === 'author') throw err;
    }
    if (kind === 'author') {
      const author = work?.authors[0];
      if (!author) throw new AppError(404, 'NOT_FOUND', 'This book has no author');
      const row = this.deps.dismissals.add(userId, {
        kind,
        key: authorKey(author),
        workId,
        author,
      });
      return { workId, kind, author, expiresAt: row.expiresAt?.toISOString() ?? null };
    }
    this.deps.dismissals.add(userId, {
      kind,
      key: work ? workKey(work.title, work.authors) : `id:${workId}`,
      workId,
      author: null,
    });
    return { workId, kind, author: null, expiresAt: null };
  }

  /** Undo: every dismissal made from this book is forgotten. */
  undoDismiss(userId: string, workId: string): { removed: number } {
    this.requireUser(userId);
    return { removed: this.deps.dismissals.removeByWork(userId, workId) };
  }

  private requireUser(userId: string): User {
    const user = this.deps.users.findById(userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
    return user;
  }

  /** The series and author rows: the part that asks the metadata providers. */
  private async compute(
    user: User,
    mine: ReaderShelfBooks,
    languages: string[],
    lookups: Lookups,
  ): Promise<ComputedRows> {
    const ownedKeys = new Set(mine.books.map((b) => workKey(b.title, b.authors)));
    const ownedIds = new Set(mine.books.map((b) => b.workId));
    const isMine = (w: WorkSummary) =>
      ownedIds.has(w.id) ||
      ownedKeys.has(workKey(w.title, w.authors)) ||
      (w.library?.owners.some((o) => o.me) ?? false);

    const nextInSeries: Candidate[] = [];
    for (const seed of seriesSeeds(mine.books, mine.readingData).slice(0, MAX_SERIES)) {
      if (nextInSeries.length >= CACHED_PER_ROW) break;
      const workId =
        seed.book.workId ?? (await lookups.try(() => this.deps.works.matchWork(seed.book)));
      if (!workId) continue;
      const series = await lookups.try(() => this.deps.works.getSeries(user.id, workId));
      const next = series?.entries
        .filter(
          (e): e is typeof e & { position: number } =>
            e.position !== null && Number.isInteger(e.position) && e.position > seed.position,
        )
        .sort((a, b) => a.position - b.position)[0];
      // Already own the next one (read or not): nothing to suggest for this series.
      if (!next || isMine(next.work) || !inLanguages(next.work, languages)) continue;
      nextInSeries.push({
        work: next.work,
        reason: {
          kind: 'next_in_series',
          series: { name: series?.series?.name ?? seed.name, position: next.position },
          after: { title: seed.book.title, position: seed.position, basis: seed.basis },
        },
      });
    }

    const seen = new Set(nextInSeries.map((c) => workKey(c.work.title, c.work.authors)));
    const picks: { candidate: Candidate; count: number }[] = [];
    for (const seed of authorSeeds(mine.books, mine.readingData).slice(0, MAX_AUTHORS)) {
      const found = await lookups.try(() => this.deps.works.byAuthor(user.id, seed.author));
      let added = 0;
      for (const work of [...(found ?? [])].sort(newestFirst)) {
        if (added >= PER_AUTHOR) break;
        if (!work.authors.some((a) => authorKey(a) === seed.key)) continue;
        if (isMine(work) || !inLanguages(work, languages)) continue;
        // The middle of a series is the series row's job, not the author row's.
        if ((work.series?.position ?? 1) > 1) continue;
        const key = workKey(work.title, work.authors);
        if (seen.has(key)) continue;
        seen.add(key);
        added++;
        picks.push({
          count: seed.count,
          candidate: {
            work,
            reason: {
              kind: 'author',
              author: seed.author,
              basis: seed.basis,
              count: seed.count,
              title: seed.title,
            },
          },
        });
      }
    }
    const author = picks
      .sort((a, b) => newestFirst(a.candidate.work, b.candidate.work) || b.count - a.count)
      .slice(0, CACHED_PER_ROW)
      .map((p) => p.candidate);
    return { nextInSeries, author };
  }

  /** One row per other reader: books they own that I don't, finished ones first. Always fresh. */
  private async partnerRows(
    user: User,
    myBooks: ReaderBook[],
    languages: string[],
  ): Promise<RecommendationRow[]> {
    const myItems = new Set(myBooks.map((b) => b.itemId));
    const rows: RecommendationRow[] = [];
    for (const other of this.deps.users.list()) {
      if (other.id === user.id) continue;
      const partner = { id: other.id, displayName: other.displayName };
      const { books } = await this.deps.shelf.books(other);
      const picks = books
        .filter(
          (b): b is ReaderBook & { workId: string } =>
            b.workId !== null &&
            !myItems.has(b.itemId) &&
            (b.languages.length === 0 || b.languages.some((l) => languages.includes(l))),
        )
        .sort(
          (a, b) =>
            Number(finished(b)) - Number(finished(a)) ||
            (finished(a)
              ? (b.reading?.lastModified?.getTime() ?? 0) -
                (a.reading?.lastModified?.getTime() ?? 0)
              : 0) ||
            b.ownedAt.getTime() - a.ownedAt.getTime(),
        )
        .slice(0, PARTNER_CANDIDATES);
      const items: Recommendation[] = [];
      for (const book of picks) {
        const work = await this.deps.works
          .getWork(user.id, book.workId)
          .catch(() => fallbackSummary(book));
        items.push({
          work,
          reason: { kind: 'partner_shelf', partner, partnerFinished: finished(book) },
          isNew: false,
          request: null,
        });
      }
      rows.push({ kind: 'partner_shelf', partner, items });
    }
    return rows;
  }

  /**
   * The answer: fresh library state on every book, then my books, my
   * dismissals and duplicates left out, down-ranked authors moved to the
   * end, at most 10 per row and empty rows dropped.
   */
  private async present(
    user: User,
    now: Date,
    rows: {
      kind: RecommendationRow['kind'];
      partner: RecommendationRow['partner'];
      items: Candidate[];
    }[],
  ): Promise<RecommendationRow[]> {
    const all = rows.flatMap((r) => r.items);
    const library = await this.deps.library.match(
      user.id,
      [...new Map(all.map((c) => [c.work.id, c.work])).values()].map((w) => ({
        key: w.id,
        isbns: w.isbns,
        title: w.title,
        authors: w.authors,
      })),
    );
    const dismissals = this.deps.dismissals.active(user.id);
    const hiddenIds = new Set(dismissals.filter((d) => d.kind === 'book').map((d) => d.workId));
    const hiddenKeys = new Set(dismissals.filter((d) => d.kind === 'book').map((d) => d.key));
    const fewer = new Set(dismissals.filter((d) => d.kind === 'author').map((d) => d.key));
    const requests = this.deps.openRequests(user.id);
    const byFewerAuthor = (w: WorkSummary) => w.authors.some((a) => fewer.has(authorKey(a)));

    const shown = new Set<string>();
    const result: RecommendationRow[] = [];
    for (const row of rows) {
      const items = row.items
        .map((c) => ({ ...c, work: { ...c.work, library: library.get(c.work.id) ?? null } }))
        .filter((c) => {
          const key = workKey(c.work.title, c.work.authors);
          if (c.work.library?.owners.some((o) => o.me)) return false;
          if (hiddenIds.has(c.work.id) || hiddenKeys.has(key)) return false;
          if (row.kind === 'author' && byFewerAuthor(c.work)) return false;
          if (shown.has(key)) return false;
          return true;
        });
      // Stable: down-ranked authors keep their order, after everyone else.
      const ordered = [
        ...items.filter((c) => !byFewerAuthor(c.work)),
        ...items.filter((c) => byFewerAuthor(c.work)),
      ].slice(0, PER_ROW);
      for (const c of ordered) shown.add(workKey(c.work.title, c.work.authors));
      if (ordered.length === 0) continue;
      result.push({
        kind: row.kind,
        partner: row.partner,
        items: ordered.map((c) => ({
          work: c.work,
          reason: c.reason,
          isNew: isNew(c.work.publishedYear, now),
          request: requests.get(c.work.id) ?? null,
        })),
      });
    }
    return result;
  }
}

function finished(book: ReaderBook): boolean {
  return book.reading?.status === 'finished';
}

function newestFirst(a: WorkSummary, b: WorkSummary): number {
  return (b.publishedYear ?? -Infinity) - (a.publishedYear ?? -Infinity) || 0;
}

/** What the library knows about a partner's book, when the providers can't say more. */
function fallbackSummary(book: ReaderBook & { workId: string }): WorkSummary {
  const sep = book.workId.indexOf(':');
  return {
    id: book.workId,
    mediaType: 'ebook',
    title: book.title,
    subtitle: null,
    authors: book.authors,
    language: book.languages[0] ?? null,
    series: book.series
      ? { id: null, name: book.series.name, position: book.series.index, total: null }
      : null,
    publishedYear: null,
    isbns: book.isbns,
    // The library has the file; the cover service falls back to a placeholder card.
    hasCover: true,
    sources: [
      {
        provider: book.workId.slice(0, sep) as MetadataProviderName,
        id: book.workId.slice(sep + 1),
      },
    ],
    library: null,
  };
}
