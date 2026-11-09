import type { LibraryBookEntry, MyReading } from '@purrshelf/contract';

export type LibraryTab = 'mine' | 'partner' | 'all';
export type LibraryFilter = 'any' | 'unread' | 'reading' | 'finished' | 'onKobo';
export type LibrarySort = 'recent' | 'title' | 'author' | 'series';

const ownedByMe = (b: LibraryBookEntry) => b.owners.some((o) => o.me);
const ownedByOther = (b: LibraryBookEntry) => b.owners.some((o) => !o.me);

export function inTab(book: LibraryBookEntry, tab: LibraryTab): boolean {
  if (tab === 'mine') return ownedByMe(book);
  if (tab === 'partner') return ownedByOther(book);
  return true;
}

export function tabCounts(books: LibraryBookEntry[]): Record<LibraryTab, number> {
  return {
    mine: books.filter(ownedByMe).length,
    partner: books.filter(ownedByOther).length,
    all: books.length,
  };
}

/** Owned by me and by someone else: the "Both" badge. */
export const isShared = (b: LibraryBookEntry) => ownedByMe(b) && ownedByOther(b);

/** Does the book pass the filter? A book without progress counts as unread. */
export function passes(book: LibraryBookEntry, filter: LibraryFilter): boolean {
  const status = book.reading?.status ?? 'unread';
  switch (filter) {
    case 'unread':
    case 'reading':
    case 'finished':
      return status === filter;
    case 'onKobo':
      return book.onMyKobo;
    default:
      return true;
  }
}

/** "The", "A", "De", "Het", "Een" and friends don't count when sorting by title. */
const ARTICLE = /^(the|a|an|de|het|een)\s+/i;
export const titleKey = (title: string) => title.replace(ARTICLE, '').trim();

/** Sort authors by last name: "Ilse Varenkamp" sorts under V. */
export function authorKey(book: { authors: string[] }): string {
  const first = book.authors[0]?.trim() ?? '';
  const parts = first.split(/\s+/);
  return parts.length > 1 ? `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}` : first;
}

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** The books of a tab, filtered and then sorted. */
export function visibleBooks(
  books: LibraryBookEntry[],
  tab: LibraryTab,
  filter: LibraryFilter,
  sort: LibrarySort,
): LibraryBookEntry[] {
  const list = books.filter((b) => inTab(b, tab) && passes(b, filter));
  const byAdded = (a: LibraryBookEntry, b: LibraryBookEntry) => b.addedAt.localeCompare(a.addedAt);
  const byTitle = (a: LibraryBookEntry, b: LibraryBookEntry) =>
    compare(titleKey(a.title), titleKey(b.title));
  switch (sort) {
    case 'title':
      return list.sort((a, b) => byTitle(a, b) || byAdded(a, b));
    case 'author':
      return list.sort((a, b) => compare(authorKey(a), authorKey(b)) || byTitle(a, b));
    case 'series':
      // Books in a series first, by series name and position; the rest by title.
      return list.sort((a, b) => {
        if (a.series && b.series) {
          return (
            compare(a.series.name, b.series.name) ||
            (a.series.position ?? Number.MAX_VALUE) - (b.series.position ?? Number.MAX_VALUE) ||
            byTitle(a, b)
          );
        }
        if (a.series) return -1;
        if (b.series) return 1;
        return byTitle(a, b);
      });
    default:
      return list.sort(byAdded);
  }
}

export type ReadLabel =
  | { key: 'library.percentRead'; percent: number }
  | { key: 'library.unread' | 'library.reading' | 'library.finished' };

/** "42% read", "Unread", "Reading" or "Finished"; nothing without a linked Kobo. */
export function readLabel(book: { reading: MyReading | null }): ReadLabel | null {
  const r = book.reading;
  if (!r) return null;
  if (r.status === 'finished') return { key: 'library.finished' };
  if (r.progressPercent !== null && r.progressPercent > 0) {
    return { key: 'library.percentRead', percent: Math.round(r.progressPercent) };
  }
  return { key: r.status === 'reading' ? 'library.reading' : 'library.unread' };
}

/**
 * How full the progress bar is, 0–100; null for no bar. A book I am reading
 * always gets a bar, empty until my Kobo reports a position at its next sync.
 */
export function barPercent(reading: MyReading | null): number | null {
  if (!reading) return null;
  if (reading.status === 'finished') return 100;
  if (reading.progressPercent !== null && reading.progressPercent > 0) {
    return Math.min(100, Math.max(1, Math.round(reading.progressPercent)));
  }
  return reading.status === 'reading' ? 0 : null;
}
