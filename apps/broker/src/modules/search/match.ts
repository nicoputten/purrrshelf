import { cleanTitle, type BookQuery } from './planner.js';
import { isOtherVolume } from './volume.js';

/** Words of a title or release name: accents and case dropped, one-letter words left out. */
export function normalise(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

/** Small words that say nothing about which book it is (en + nl). */
const FILLER = new Set([
  'the',
  'an',
  'and',
  'of',
  'in',
  'on',
  'to',
  'for',
  'de',
  'het',
  'een',
  'en',
  'van',
  'op',
  'te',
  'voor',
]);

/** A title needs this many telling words before a release may leave out the author. */
const MIN_TELLING_WORDS = 2;

export interface BookMatch {
  /** Share of the cleaned title's words found in the release name. */
  titleMatch: number;
  /** The release names one of the authors' surnames (true when the work has no author). */
  authorMatch: boolean;
  /** The release names another volume of the book's series (BRK-15). */
  otherVolume: boolean;
  /**
   * The words found are enough to tell this book from others: the author is
   * named (or the work has no author), or the title (or title plus subtitle)
   * has at least two telling words. "Atlas" alone also names "Atlas of Hell"
   * (BRK-16).
   */
  identified: boolean;
}

const telling = (words: string[]) => words.filter((w) => !FILLER.has(w)).length;

/** How well a release name points at the book the request asked for. */
export function matchBook(query: BookQuery, releaseTitle: string): BookMatch {
  const have = new Set(normalise(releaseTitle));
  const want = normalise(cleanTitle(query.title));
  const titleMatch = want.length ? want.filter((w) => have.has(w)).length / want.length : 0;

  const surnames = query.authors.flatMap((a) => normalise(a).slice(-1));
  const authorMatch = surnames.length === 0 || surnames.some((s) => have.has(s));

  const full = normalise(query.title);
  const fullFound = full.length > 0 && full.every((w) => have.has(w));
  const identified =
    authorMatch ||
    telling(want) >= MIN_TELLING_WORDS ||
    (fullFound && telling(full) >= MIN_TELLING_WORDS);

  return { titleMatch, authorMatch, otherVolume: isOtherVolume(query, releaseTitle), identified };
}
