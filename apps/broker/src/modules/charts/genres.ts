import type { ChartGenre } from '@purrshelf/contract';

/** The genres a chart is split into, without `all` (the whole chart). */
export type BookGenre = Exclude<ChartGenre, 'all'>;

/**
 * Apple Books genre ids (stable across countries; the names are translated).
 * A book carries its main genre and sub-genres, e.g. 9032 Mysteries &
 * Thrillers with 10052 Police Procedural.
 */
const APPLE_GENRES: Record<BookGenre, readonly number[]> = {
  // Mysteries & Thrillers; Police Procedural, Women Sleuths
  thriller: [9032, 10052, 10055],
  // Romance; Contemporary, Paranormal, Romantic Suspense, New Adult, Military
  romance: [9003, 10057, 10058, 10061, 11040, 11233],
  // Literary Fiction; Classics
  literary: [10049, 10042],
  // Historical Fiction
  historical: [10047],
  // Sci-Fi & Fantasy; Fantasy
  fantasy_scifi: [9020, 10044],
  // Biographies & Memoirs
  biography: [9008],
  // Nonfiction, History, Business & Personal Finance, Health Mind & Body,
  // Politics & Current Events, Science & Nature, Economics, Psychology, Self-Improvement
  nonfiction: [9002, 9015, 9009, 9025, 9034, 9019, 10011, 10094, 10119],
};

/**
 * Hardcover genre tags are free text added by readers ("Fantasy",
 * "Thriller", "Literary Fiction"). Matched case-insensitively, whole tag only.
 */
const HARDCOVER_TAGS: Record<BookGenre, readonly string[]> = {
  thriller: ['thriller', 'thrillers', 'mystery', 'crime', 'suspense', 'mystery thriller'],
  romance: ['romance', 'romantasy', 'contemporary romance', 'historical romance'],
  literary: ['literary fiction', 'literary', 'classics'],
  historical: ['historical fiction', 'historical'],
  fantasy_scifi: ['fantasy', 'science fiction', 'sci-fi', 'speculative fiction', 'dystopian'],
  biography: ['biography', 'memoir', 'autobiography', 'biography & memoir'],
  nonfiction: ['nonfiction', 'non-fiction', 'history', 'science', 'self-help', 'psychology'],
};

const bookGenres = Object.keys(APPLE_GENRES) as BookGenre[];

/** The chart genres of an Apple Books entry, from its genre ids. */
export function appleGenres(genreIds: readonly number[]): BookGenre[] {
  const ids = new Set(genreIds);
  return bookGenres.filter((g) => APPLE_GENRES[g].some((id) => ids.has(id)));
}

/** The chart genres of a Hardcover book, from its genre tags. */
export function hardcoverGenres(tags: readonly string[]): BookGenre[] {
  const norm = new Set(tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ')));
  return bookGenres.filter((g) => HARDCOVER_TAGS[g].some((t) => norm.has(t)));
}

/**
 * Splits a ranked chart into top lists per genre: `all` first, then each
 * genre in the contract's order, at most `perList` each. Ranks restart at 1
 * in every list; a genre with no books is left out.
 */
export function splitByGenre<T extends { genres: readonly BookGenre[] }>(
  ranked: readonly T[],
  perList: number,
): { genre: ChartGenre; items: { rank: number; entry: T }[] }[] {
  const lists: { genre: ChartGenre; items: { rank: number; entry: T }[] }[] = [];
  for (const genre of ['all', ...bookGenres] as ChartGenre[]) {
    const items = ranked
      .filter((e) => genre === 'all' || e.genres.includes(genre as BookGenre))
      .slice(0, perList)
      .map((entry, i) => ({ rank: i + 1, entry }));
    if (items.length > 0) lists.push({ genre, items });
  }
  return lists;
}
