import type { LibraryBookEntry, MyReading } from '@purrshelf/contract';

export type LibraryTab = 'mine' | 'partner' | 'all';
export type LibraryView = 'recent' | 'unread' | 'onKobo' | 'series';

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

/** The books of a tab, filtered and sorted for the chosen view. */
export function visibleBooks(
  books: LibraryBookEntry[],
  tab: LibraryTab,
  view: LibraryView,
): LibraryBookEntry[] {
  const list = books.filter((b) => inTab(b, tab));
  const byAdded = (a: LibraryBookEntry, b: LibraryBookEntry) => b.addedAt.localeCompare(a.addedAt);
  switch (view) {
    case 'unread':
      return list.filter((b) => (b.reading?.status ?? 'unread') === 'unread').sort(byAdded);
    case 'onKobo':
      return list.filter((b) => b.onMyKobo).sort(byAdded);
    case 'series':
      return list
        .flatMap((b) => (b.series ? [{ b, s: b.series }] : []))
        .sort(
          (x, y) =>
            x.s.name.localeCompare(y.s.name) ||
            (x.s.position ?? Number.MAX_VALUE) - (y.s.position ?? Number.MAX_VALUE),
        )
        .map((x) => x.b);
    default:
      return [...list].sort(byAdded);
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
