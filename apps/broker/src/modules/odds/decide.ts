import {
  LOW_ODDS_NEW_DAYS,
  LOW_ODDS_NOT_FOUND_DAYS,
  LOW_ODDS_RARE_READERS,
  type BookLanguage,
  type LowOdds,
} from '@purrshelf/contract';

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the broker knows for free about a book before Add (metadata and the requests table). */
export interface OddsFacts {
  workId: string;
  /** The language the reader chose in the Add sheet. */
  language: BookLanguage;
  /** ISBN-13s from the merged metadata. */
  isbns: readonly string[];
  /** Full publication date (YYYY-MM-DD) when a provider has one. */
  releaseDate: string | null;
  publishedYear: number | null;
  /** The work's own language (ISO 639-1) when known. */
  workLanguage: string | null;
  /** Languages of every known edition. */
  languages: readonly string[];
  /** Hardcover readers; null when Hardcover doesn't know the book. */
  readers: number | null;
  /** When the latest request for this work (any reader) ended "not found". */
  lastNotFoundAt: Date | null;
}

const none = { notFoundAt: null, releaseDate: null, englishEditionWorkId: null, readers: null };

/** Midnight UTC of a date, in ms. */
function dayOf(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isNew(f: OddsFacts, now: Date): boolean {
  if (f.releaseDate) {
    const released = Date.parse(`${f.releaseDate}T00:00:00.000Z`);
    return dayOf(now) - released <= LOW_ODDS_NEW_DAYS * DAY_MS;
  }
  // Only a year: a year after this one means it is not out yet.
  return f.publishedYear !== null && f.publishedYear > now.getUTCFullYear();
}

/**
 * The single strongest reason a search is unlikely to find this book, or
 * null (ADR 0041). Pure: the caller gathers the facts without any indexer.
 */
export function lowOdds(f: OddsFacts, now: Date): LowOdds | null {
  if (
    f.lastNotFoundAt &&
    now.getTime() - f.lastNotFoundAt.getTime() <= LOW_ODDS_NOT_FOUND_DAYS * DAY_MS
  ) {
    return { ...none, code: 'LOW_ODDS_NOT_FOUND', notFoundAt: f.lastNotFoundAt.toISOString() };
  }
  if (f.isbns.length === 0) return { ...none, code: 'LOW_ODDS_NO_MATCH' };
  if (isNew(f, now)) return { ...none, code: 'LOW_ODDS_NEW', releaseDate: f.releaseDate };
  if (f.language !== 'en') {
    const english = f.workLanguage === 'en' || f.languages.includes('en');
    return { ...none, code: 'LOW_ODDS_LANGUAGE', englishEditionWorkId: english ? f.workId : null };
  }
  if (f.readers !== null && f.readers < LOW_ODDS_RARE_READERS) {
    return { ...none, code: 'LOW_ODDS_RARE', readers: f.readers };
  }
  return null;
}
