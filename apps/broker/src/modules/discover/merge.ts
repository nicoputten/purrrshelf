import type { MetadataProviderName, WorkSummary } from '@purrshelf/contract';
import { workKey } from './normalise.js';
import type { ProviderWork } from './types.js';

/** One book as found across providers; `sources[0]` is the best (highest priority) record. */
export interface MergedWork {
  sources: [ProviderWork, ...ProviderWork[]];
}

/** The id of the merged hit: its best source's. */
export function mergedId(group: MergedWork): string {
  return workIdOf(group.sources[0]);
}

export function workIdOf(w: Pick<ProviderWork, 'provider' | 'id'>): string {
  return `${w.provider}:${w.id}`;
}

/**
 * Merges provider results given in priority order (Hardcover, Open Library,
 * Google Books). Records are the same book when they share an ISBN, or else
 * when their normalised title and first author's surname match (ADR 0007).
 */
export function mergeResults(lists: readonly ProviderWork[][]): MergedWork[] {
  const merged: MergedWork[] = [];
  const byIsbn = new Map<string, MergedWork>();
  const byKey = new Map<string, MergedWork>();

  for (const list of lists) {
    for (const work of list) {
      const key = workKey(work.title, work.authors);
      const group = work.isbns.map((i) => byIsbn.get(i)).find(Boolean) ?? byKey.get(key);
      let target = group;
      if (target) {
        // One record per provider in a group: a second one is a duplicate or another edition.
        if (target.sources.some((s) => s.provider === work.provider)) continue;
        target.sources.push(work);
      } else {
        target = { sources: [work] };
        merged.push(target);
      }
      for (const isbn of work.isbns) if (!byIsbn.has(isbn)) byIsbn.set(isbn, target);
      if (!byKey.has(key)) byKey.set(key, target);
    }
  }
  return merged;
}

const first = <T>(
  sources: readonly ProviderWork[],
  pick: (w: ProviderWork) => T | null | undefined,
) => {
  for (const s of sources) {
    const v = pick(s);
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) return v;
  }
  return null;
};

/** The best value for each field: from the best source that has it. */
export function flatten(group: MergedWork): ProviderWork {
  const [best, ...rest] = group.sources;
  const all = [best, ...rest];
  return {
    provider: best.provider,
    id: best.id,
    title: best.title,
    subtitle: best.subtitle ?? first(rest, (s) => s.subtitle),
    authors: first(all, (s) => s.authors) ?? [],
    language: first(all, (s) => s.language),
    series: first(all, (s) => (s.series?.id ? s.series : null)) ?? first(all, (s) => s.series),
    publishedYear: first(all, (s) => s.publishedYear),
    isbns: [...new Set(all.flatMap((s) => s.isbns))].slice(0, 40),
    coverUrl: first(all, (s) => s.coverUrl),
    description: first(all, (s) => s.description),
    subjects: first(all, (s) => s.subjects) ?? [],
    pageCount: first(all, (s) => s.pageCount),
  };
}

/** Every cover URL, best first, for the cover fallback chain (BRK-07). */
export function coverUrls(group: MergedWork): string[] {
  return group.sources.flatMap((s) => (s.coverUrl ? [s.coverUrl] : []));
}

export function toSummary(group: MergedWork, library: WorkSummary['library']): WorkSummary {
  const w = flatten(group);
  return {
    id: workIdOf(w),
    mediaType: 'ebook',
    title: w.title,
    subtitle: w.subtitle,
    authors: w.authors,
    language: w.language,
    series: w.series,
    publishedYear: w.publishedYear,
    isbns: w.isbns,
    hasCover: coverUrls(group).length > 0,
    sources: group.sources.map((s) => ({ provider: s.provider as MetadataProviderName, id: s.id })),
    library,
  };
}
