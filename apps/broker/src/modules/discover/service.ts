import type {
  DiscoverSearchQuery,
  DiscoverSearchResult,
  LibraryState,
  MetadataProviderName,
  ProviderStatus,
  SimilarReason,
  SimilarWorks,
  WorkDetail,
  WorkSeries,
  WorkSummary,
} from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import { AppError } from '../../errors.js';
import type { MetadataCache } from './cache.js';
import { normaliseIsbns, workKey } from './normalise.js';
import type { LibraryLookup } from './library-lookup.js';
import {
  coverUrls,
  flatten,
  mergedId,
  mergeResults,
  toSummary,
  workIdOf,
  type MergedWork,
} from './merge.js';
import type { MetadataProvider, MetadataQuery, ProviderSeries, ProviderWork } from './types.js';

const MAX_HITS = 30;
/** Similar books (APP-09): at most this many in all, and per reason. */
const MAX_SIMILAR = 12;
const SIMILAR_PER_REASON: Record<SimilarReason, number> = { series: 4, author: 4, subject: 12 };
const SIMILAR_SUBJECTS = 2;

export interface DiscoverDeps {
  /** In priority order: Hardcover, Open Library, Google Books. */
  providers: MetadataProvider[];
  cache: MetadataCache;
  library: LibraryLookup;
  log: Pick<FastifyBaseLogger, 'warn'>;
}

function unavailable(): AppError {
  return new AppError(502, 'METADATA_UNAVAILABLE', 'Book search is not available right now');
}

function queryKey(q: MetadataQuery): string {
  const norm = (s = '') => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${norm(q.title)}|${norm(q.author)}|${norm(q.subject)}|${q.language}`;
}

/**
 * Metadata search, work details and series. Free and cached: nothing here
 * may reach an indexer (ADR 0005); a test enforces it.
 */
export class DiscoverService {
  constructor(private readonly deps: DiscoverDeps) {}

  private provider(name: string): MetadataProvider | undefined {
    return this.deps.providers.find((p) => p.name === name && p.configured);
  }

  /** Asks every configured provider in parallel; a failing provider is logged and skipped. */
  private async fanOut(
    q: MetadataQuery,
  ): Promise<{ lists: ProviderWork[][]; statuses: ProviderStatus[] }> {
    const statuses: ProviderStatus[] = [];
    const lists = await Promise.all(
      this.deps.providers.map(async (p): Promise<ProviderWork[]> => {
        if (!p.configured) {
          statuses.push({ provider: p.name, status: 'skipped' });
          return [];
        }
        try {
          const works = await this.deps.cache.getOrSet(`${p.name}:search:${queryKey(q)}`, () =>
            p.search(q),
          );
          statuses.push({ provider: p.name, status: 'ok' });
          return works ?? [];
        } catch (err) {
          this.deps.log.warn({ err, provider: p.name }, 'metadata search failed');
          statuses.push({ provider: p.name, status: 'failed' });
          return [];
        }
      }),
    );
    return { lists, statuses };
  }

  async search(userId: string, query: DiscoverSearchQuery): Promise<DiscoverSearchResult> {
    const q: MetadataQuery = {
      title: query.q,
      language: query.language,
      ...(query.author ? { author: query.author } : {}),
    };
    const { lists, statuses } = await this.fanOut(q);
    if (!statuses.some((s) => s.status === 'ok')) throw unavailable();

    const groups = mergeResults(lists)
      .filter((g) => {
        if (query.language === 'any') return true;
        const lang = flatten(g).language;
        return lang === null || lang === query.language;
      })
      .slice(0, MAX_HITS);
    for (const g of groups) this.deps.cache.set(`hit:${mergedId(g)}`, g);

    const library = await this.matchLibrary(userId, groups);
    const order = this.deps.providers.map((p) => p.name);
    return {
      hits: groups.map((g) => toSummary(g, library.get(mergedId(g)) ?? null)),
      providers: statuses.sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider)),
    };
  }

  /** The merged record for a work id, from the provider (cached) plus whatever search found. */
  async workGroup(id: string): Promise<MergedWork> {
    const sep = id.indexOf(':');
    const providerName = id.slice(0, sep) as MetadataProviderName;
    const localId = id.slice(sep + 1);
    const hit = this.deps.cache.get<MergedWork>(`hit:${id}`);
    const provider = this.provider(providerName);

    let detail: ProviderWork | null = null;
    let failed = false;
    if (provider) {
      try {
        detail = await this.deps.cache.getOrSet(`${providerName}:work:${localId}`, () =>
          provider.getWork(localId),
        );
      } catch (err) {
        this.deps.log.warn({ err, provider: providerName }, 'metadata work lookup failed');
        failed = true;
      }
    }
    if (!detail) {
      if (hit) return hit;
      if (failed) throw unavailable();
      throw new AppError(404, 'NOT_FOUND', 'No such book');
    }
    const [primary, ...rest] = hit?.sources ?? [];
    const group: MergedWork = {
      // Work replies lack some search fields (Open Library has no ISBNs there): fill them in.
      sources: [primary ? flatten({ sources: [detail, primary] }) : detail, ...rest],
    };
    this.deps.cache.set(`hit:${id}`, group);
    return group;
  }

  async getWork(userId: string, id: string): Promise<WorkDetail> {
    const group = await this.workGroup(id);
    const library = await this.matchLibrary(userId, [group]);
    const flat = flatten(group);
    return {
      ...toSummary(group, library.get(id) ?? null),
      id,
      description: flat.description ?? null,
      subjects: flat.subjects ?? [],
      pageCount: flat.pageCount ?? null,
    };
  }

  async getSeries(userId: string, id: string): Promise<WorkSeries> {
    const group = await this.workGroup(id);
    const flat = flatten(group);
    const ref = flat.series;
    if (!ref) return { series: null, entries: [] };

    const series = await this.providerSeries(ref.id);
    if (series && series.entries.length > 0) {
      const entries = series.entries.map((e) => ({
        position: e.position,
        group: { sources: [e.work] } satisfies MergedWork,
      }));
      const library = await this.matchLibrary(
        userId,
        entries.map((e) => e.group),
      );
      return {
        series: { id: `${series.provider}:${series.id}`, name: series.name, total: series.total },
        entries: entries.map((e) => ({
          position: e.position,
          work: toSummary(e.group, library.get(mergedId(e.group)) ?? null),
        })),
      };
    }
    // No series data beyond this book's own record.
    const library = await this.matchLibrary(userId, [group]);
    return {
      series: { id: ref.id, name: ref.name, total: ref.total },
      entries: [
        { position: ref.position, work: { ...toSummary(group, library.get(id) ?? null), id } },
      ],
    };
  }

  private async providerSeries(
    seriesId: string | null,
  ): Promise<(ProviderSeries & { provider: string }) | null> {
    const [, name = '', localId = ''] = seriesId?.match(/^(\w+):(.+)$/) ?? [];
    const provider = this.provider(name);
    const getSeries = provider?.getSeries?.bind(provider);
    if (!provider || !getSeries) return null;
    try {
      const series = await this.deps.cache.getOrSet(`${name}:series:${localId}`, () =>
        getSeries(localId),
      );
      return series && { ...series, provider: name };
    } catch (err) {
      this.deps.log.warn({ err, provider: provider.name }, 'metadata series lookup failed');
      return null;
    }
  }

  /**
   * Similar books (APP-09): other books in the series (the ones after this
   * one first), then more by the first author, then books sharing a subject.
   * Built from metadata only, so it never touches an indexer (ADR 0005).
   * When the book's language is known, other languages are left out.
   */
  async getSimilar(userId: string, id: string): Promise<SimilarWorks> {
    const group = await this.workGroup(id);
    const flat = flatten(group);
    const seen = new Set([workKey(flat.title, flat.authors)]);
    const works: SimilarWorks['works'] = [];
    const add = (reason: SimilarReason, candidates: SimilarWorks['works'][number]['work'][]) => {
      let added = 0;
      for (const work of candidates) {
        if (works.length >= MAX_SIMILAR || added >= SIMILAR_PER_REASON[reason]) return;
        const key = workKey(work.title, work.authors);
        if (seen.has(key) || work.id === id) continue;
        seen.add(key);
        works.push({ reason, work });
        added++;
      }
    };

    if (flat.series) {
      const { entries } = await this.getSeries(userId, id);
      const here = flat.series.position ?? 0;
      const after = entries.filter((e) => (e.position ?? 0) > here);
      const before = entries.filter((e) => (e.position ?? 0) <= here);
      add(
        'series',
        [...after, ...before].map((e) => e.work),
      );
    }

    const sameLanguage = (w: WorkSummary) =>
      !flat.language || !w.language || w.language === flat.language;
    const related = async (q: MetadataQuery) =>
      (await this.related(userId, q)).works.filter(sameLanguage);

    const author = flat.authors[0];
    if (author) add('author', await related({ author, language: 'any' }));
    for (const subject of (flat.subjects ?? []).slice(0, SIMILAR_SUBJECTS)) {
      if (works.length >= MAX_SIMILAR) break;
      add('subject', await related({ subject, language: 'any' }));
    }
    return { works };
  }

  /**
   * Books by an author in any language, with library state (For you,
   * BRK-11). Metadata only. Throws METADATA_UNAVAILABLE when no provider
   * answered, so a caller can tell "nothing found" from "could not look".
   */
  async byAuthor(userId: string, author: string): Promise<WorkSummary[]> {
    const { works, answered } = await this.related(userId, { author, language: 'any' });
    if (!answered) throw unavailable();
    return works;
  }

  /** Merged hits for a related-books query, remembered like search hits so their pages open. */
  private async related(
    userId: string,
    q: MetadataQuery,
  ): Promise<{ works: WorkSummary[]; answered: boolean }> {
    const { lists, statuses } = await this.fanOut(q);
    const groups = mergeResults(lists);
    for (const g of groups) this.deps.cache.set(`hit:${mergedId(g)}`, g);
    const library = await this.matchLibrary(userId, groups);
    return {
      works: groups.map((g) => toSummary(g, library.get(mergedId(g)) ?? null)),
      answered: statuses.some((s) => s.status === 'ok'),
    };
  }

  /** Title and authors for a placeholder cover. */
  async workSummary(id: string): Promise<{ title: string; authors: string[] }> {
    const { title, authors } = flatten(await this.workGroup(id));
    return { title, authors };
  }

  /**
   * The work a library book is (BRK-09): a search hit sharing one of its
   * ISBNs, or else one with the same title and first author. Null when no
   * hit is clearly the same book. Throws when no provider answered.
   */
  async matchWork(book: {
    title: string;
    authors: string[];
    isbns: string[];
  }): Promise<string | null> {
    const [author] = book.authors;
    const { lists, statuses } = await this.fanOut({
      title: book.title,
      language: 'any',
      ...(author ? { author } : {}),
    });
    if (!statuses.some((s) => s.status === 'ok')) throw unavailable();

    const groups = mergeResults(lists);
    const isbns = new Set(normaliseIsbns(book.isbns));
    const key = workKey(book.title, book.authors);
    const match =
      groups.find((g) => flatten(g).isbns.some((i) => isbns.has(i))) ??
      groups.find((g) => {
        const w = flatten(g);
        return workKey(w.title, w.authors) === key;
      });
    if (!match) return null;
    this.deps.cache.set(`hit:${mergedId(match)}`, match);
    return mergedId(match);
  }

  /** Cover URLs for a work, best first (used by the cover service). */
  async coverUrls(id: string): Promise<string[]> {
    return coverUrls(await this.workGroup(id));
  }

  private async matchLibrary(
    userId: string,
    groups: MergedWork[],
  ): Promise<Map<string, LibraryState>> {
    if (groups.length === 0) return new Map();
    return this.deps.library.match(
      userId,
      groups.map((g) => {
        const w = flatten(g);
        return { key: workIdOf(w), isbns: w.isbns, title: w.title, authors: w.authors };
      }),
    );
  }
}
