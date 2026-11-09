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
 * Genre tags: Hardcover's are free text added by readers ("Fantasy",
 * "Thriller", "Literary Fiction"); Calibre's come from whatever filled in the
 * library's metadata, in English or Dutch ("Fiction / Thrillers", "Spanning").
 * Matched case-insensitively, whole tag or whole part of a compound tag.
 */
const GENRE_TAGS: Record<BookGenre, readonly string[]> = {
  thriller: [
    'thriller',
    'thrillers',
    'mystery',
    'crime',
    'suspense',
    'mystery thriller',
    'detective',
    'detectives',
    'spanning',
    'misdaad',
  ],
  romance: [
    'romance',
    'romantasy',
    'contemporary romance',
    'historical romance',
    'romantiek',
    'romantisch',
  ],
  literary: ['literary fiction', 'literary', 'classics', 'literatuur', 'literaire roman'],
  historical: ['historical fiction', 'historical', 'historische roman'],
  fantasy_scifi: [
    'fantasy',
    'science fiction',
    'sci-fi',
    'speculative fiction',
    'dystopian',
    'sciencefiction',
  ],
  biography: [
    'biography',
    'memoir',
    'autobiography',
    'biography & memoir',
    'biografie',
    'memoires',
  ],
  nonfiction: [
    'nonfiction',
    'non-fiction',
    'history',
    'science',
    'self-help',
    'psychology',
    'non-fictie',
    'geschiedenis',
    'psychologie',
    'zelfhulp',
  ],
};

/** Books finished this many days back count towards the reader's top genre. */
export const TOP_GENRE_DAYS = 30;

const bookGenres = Object.keys(APPLE_GENRES) as BookGenre[];

/** The chart genres of an Apple Books entry, from its genre ids. */
export function appleGenres(genreIds: readonly number[]): BookGenre[] {
  const ids = new Set(genreIds);
  return bookGenres.filter((g) => APPLE_GENRES[g].some((id) => ids.has(id)));
}

const normTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');

/** The chart genres of a book, from its genre tags (Hardcover or Calibre). */
export function tagGenres(tags: readonly string[]): BookGenre[] {
  const norm = new Set<string>();
  for (const tag of tags) {
    norm.add(normTag(tag));
    for (const part of tag.split(/[/,&]/)) norm.add(normTag(part));
  }
  return bookGenres.filter((g) => GENRE_TAGS[g].some((t) => norm.has(t)));
}

/** The chart genres of a Hardcover book, from its genre tags. */
export const hardcoverGenres = tagGenres;

/**
 * The reader's top genre (BRK-14, ADR 0044): the genre of most books they
 * finished in the last {@link TOP_GENRE_DAYS} days, by Calibre tags. A tie
 * goes to the genre finished most recently. Null when no such book has a
 * known genre.
 */
export function topGenre(
  books: readonly {
    tags: readonly string[];
    reading: { status: string; lastModified: Date | null } | null;
  }[],
  now: Date,
): BookGenre | null {
  const since = now.getTime() - TOP_GENRE_DAYS * 24 * 60 * 60 * 1000;
  const score = new Map<BookGenre, { count: number; last: number }>();
  for (const book of books) {
    const at = book.reading?.lastModified?.getTime();
    if (book.reading?.status !== 'finished' || at === undefined || at < since) continue;
    for (const genre of tagGenres(book.tags)) {
      const s = score.get(genre) ?? { count: 0, last: 0 };
      score.set(genre, { count: s.count + 1, last: Math.max(s.last, at) });
    }
  }
  let best: { genre: BookGenre; count: number; last: number } | null = null;
  for (const [genre, s] of score) {
    if (!best || s.count > best.count || (s.count === best.count && s.last > best.last)) {
      best = { genre, ...s };
    }
  }
  return best?.genre ?? null;
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
