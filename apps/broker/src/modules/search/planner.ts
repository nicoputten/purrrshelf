import type { NewznabCaps, NewznabParams } from '../budget/gateway.js';

/** What a request searches for: a snapshot of the work the user added. */
export interface BookQuery {
  title: string;
  authors: string[];
  isbn13?: string | undefined;
  language: 'en' | 'nl';
  /** The work's series and its place in it, so another volume is never taken for it. */
  series?: { name: string; position: number | null } | undefined;
}

export const variantIds = ['book', 'author_title', 'title', 'isbn'] as const;
export type VariantId = (typeof variantIds)[number];

export interface QueryVariant {
  id: VariantId;
  params: NewznabParams;
  /** Human-readable form, stored on the attempt. */
  label: string;
}

/** Newznab categories: 7000 Books, 7020 Books/Ebook. */
const EBOOK = '7020';
const BOOKS = '7000';

/** Drops a subtitle ("Title: A Novel") and a series suffix ("Title (Series #2)"). */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*[)\]]\s*$/, '')
    .replace(/\s*(?:[:–—]|\s-)\s.*$/, '')
    .trim();
}

/** Every variant this indexer can run for the query, in the default order. */
export function variantsFor(query: BookQuery, caps: NewznabCaps | null): QueryVariant[] {
  const author = query.authors[0];
  const title = cleanTitle(query.title);
  const out: QueryVariant[] = [];
  if (caps?.bookSearch && caps.bookParams.includes('title')) {
    const params: NewznabParams = { t: 'book', title, cat: EBOOK };
    if (author && caps.bookParams.includes('author')) params.author = author;
    out.push({
      id: 'book',
      params,
      label: `book title=${title}${params.author ? ` author=${author}` : ''}`,
    });
  }
  if (author) {
    const q = `${author} ${title}`;
    out.push({
      id: 'author_title',
      params: { t: 'search', q, cat: EBOOK },
      label: `search q=${q}`,
    });
  }
  out.push({
    id: 'title',
    params: { t: 'search', q: title, cat: BOOKS },
    label: `search q=${title}`,
  });
  if (query.isbn13) {
    out.push({
      id: 'isbn',
      params: { t: 'search', q: query.isbn13, cat: BOOKS },
      label: `search q=${query.isbn13}`,
    });
  }
  return out;
}

export interface VariantStats {
  attempts: number;
  hits: number;
}

/**
 * Orders variants by measured hit rate (Laplace-smoothed, so a variant with
 * no history starts at 50%), keeping the default order on ties.
 */
export function orderByHitRate(
  variants: QueryVariant[],
  stats: ReadonlyMap<VariantId, VariantStats>,
): QueryVariant[] {
  const rate = (v: QueryVariant): number => {
    const s = stats.get(v.id) ?? { attempts: 0, hits: 0 };
    return (s.hits + 1) / (s.attempts + 2);
  };
  return variants
    .map((v, i) => ({ v, i, r: rate(v) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.v);
}
