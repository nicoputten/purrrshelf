import { createHash } from 'node:crypto';
import type { RecommendationBasis, WorkSummary } from '@purrshelf/contract';
import { authorKey } from '../discover/normalise.js';
import type { ReaderBook } from './types.js';

/** A language counts as one the reader reads from this share of their books (ADR 0035). */
const LANGUAGE_SHARE = 0.2;
/** Without Kobo data an author needs this many owned books to count. */
const MIN_OWNED_BY_AUTHOR = 2;

/**
 * What a book says about the reader's taste: finished and in-progress books
 * when their Kobo is linked, otherwise every owned book. Null: not a signal.
 */
export function basisOf(book: ReaderBook, readingData: boolean): RecommendationBasis | null {
  if (!readingData) return 'owned';
  const status = book.reading?.status;
  return status === 'finished' || status === 'reading' ? status : null;
}

/** When the reader last did something with the book: read it on the Kobo, or got it. */
export function activityOf(book: ReaderBook): number {
  return Math.max(book.reading?.lastModified?.getTime() ?? 0, book.ownedAt.getTime());
}

/**
 * The languages a reader reads: every language of at least a fifth of the
 * books that count (finished, or owned without Kobo data). Falls back to the
 * app's language when Calibre knows no language for any of them.
 */
export function readerLanguages(
  books: ReaderBook[],
  readingData: boolean,
  locale: string,
): string[] {
  const counted = books.filter((b) =>
    readingData ? b.reading?.status === 'finished' : basisOf(b, false),
  );
  const counts = new Map<string, number>();
  let known = 0;
  for (const book of counted) {
    const [lang] = book.languages;
    if (!lang) continue;
    known++;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const langs = [...counts]
    .filter(([, n]) => n / known >= LANGUAGE_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lang]) => lang);
  return langs.length > 0 ? langs : [locale];
}

/** Books in an unknown language pass; others must be in one the reader reads. */
export function inLanguages(work: Pick<WorkSummary, 'language'>, languages: string[]): boolean {
  return work.language === null || languages.includes(work.language);
}

export interface SeriesSeed {
  name: string;
  /** The reader's furthest book in the series that counts. */
  book: ReaderBook;
  position: number;
  basis: RecommendationBasis;
  activity: number;
}

/** One seed per series the reader is in, most recently active first. */
export function seriesSeeds(books: ReaderBook[], readingData: boolean): SeriesSeed[] {
  const seeds = new Map<string, SeriesSeed>();
  for (const book of books) {
    const basis = basisOf(book, readingData);
    if (!basis || !book.series) continue;
    const key = book.series.name.trim().toLowerCase();
    const seed = seeds.get(key);
    const activity = activityOf(book);
    if (!seed || book.series.index > seed.position) {
      seeds.set(key, {
        name: book.series.name,
        book,
        position: book.series.index,
        basis,
        activity: Math.max(activity, seed?.activity ?? 0),
      });
    } else {
      seed.activity = Math.max(seed.activity, activity);
    }
  }
  return [...seeds.values()].sort((a, b) => b.activity - a.activity);
}

export interface AuthorSeed {
  author: string;
  key: string;
  count: number;
  /** The one book, when count is 1. */
  title: string | null;
  basis: RecommendationBasis;
  activity: number;
}

/**
 * Authors the reader finishes (or, without Kobo data, owns at least two
 * books by), most books first, then most recent.
 */
export function authorSeeds(books: ReaderBook[], readingData: boolean): AuthorSeed[] {
  const seeds = new Map<string, AuthorSeed>();
  for (const book of books) {
    const basis = basisOf(book, readingData);
    if (basis !== 'finished' && basis !== 'owned') continue;
    for (const author of book.authors) {
      const key = authorKey(author);
      if (!key) continue;
      const seed = seeds.get(key);
      if (seed) {
        seed.count++;
        seed.title = null;
        seed.activity = Math.max(seed.activity, activityOf(book));
      } else {
        seeds.set(key, {
          author,
          key,
          count: 1,
          title: book.title,
          basis,
          activity: activityOf(book),
        });
      }
    }
  }
  const min = readingData ? 1 : MIN_OWNED_BY_AUTHOR;
  return [...seeds.values()]
    .filter((s) => s.count >= min)
    .sort((a, b) => b.count - a.count || b.activity - a.activity);
}

/** "New": published this year or last year (providers give the year only). */
export function isNew(publishedYear: number | null, now: Date): boolean {
  return publishedYear !== null && publishedYear >= now.getUTCFullYear() - 1;
}

/**
 * What the cached rows were built from. Finishing (or starting) a book, a
 * new owned book without Kobo data, or a language change makes it differ.
 */
export function fingerprint(
  books: ReaderBook[],
  readingData: boolean,
  languages: string[],
): string {
  const basis = books
    .map((b) => [b.calibreBookId, basisOf(b, readingData)] as const)
    .filter(([, basis]) => basis !== null)
    .sort((a, b) => a[0] - b[0]);
  return createHash('sha256')
    .update(JSON.stringify({ readingData, basis, languages }))
    .digest('hex');
}
