import type {
  ImportStatus,
  LibraryBookEntry,
  LibraryBooks,
  LibraryOwner,
} from '@purrshelf/contract';

/** One way to assign a book: a single reader, or everyone ("Both" for two readers). */
export interface OwnerChoice {
  key: string;
  /** i18n key and values for the label. */
  label: { key: 'import.me' | 'import.both' | 'import.everyone' | 'import.reader'; name?: string };
  ownerIds: string[];
}

export const EVERYONE = 'everyone';
export const NONE = 'none';

/** Me first, then the other readers, then everyone when there is more than one reader. */
export function ownerChoices(readers: LibraryOwner[]): OwnerChoice[] {
  const choices: OwnerChoice[] = readers.map((r) => ({
    key: r.id,
    label: r.me ? { key: 'import.me' } : { key: 'import.reader', name: r.displayName },
    ownerIds: [r.id],
  }));
  if (readers.length > 1) {
    choices.push({
      key: EVERYONE,
      label: { key: readers.length === 2 ? 'import.both' : 'import.everyone' },
      ownerIds: readers.map((r) => r.id),
    });
  }
  return choices;
}

/** The choice that matches the book's owners exactly, or NONE. */
export function choiceOf(book: LibraryBookEntry, choices: OwnerChoice[]): string {
  const owners = new Set(book.owners.map((o) => o.id));
  const match = choices.find(
    (c) => c.ownerIds.length === owners.size && c.ownerIds.every((id) => owners.has(id)),
  );
  return match?.key ?? NONE;
}

export type ImportFilter = 'unassigned' | 'all';

export function filterBooks(books: LibraryBookEntry[], filter: ImportFilter): LibraryBookEntry[] {
  const list = filter === 'all' ? books : books.filter((b) => b.owners.length === 0);
  return [...list].sort((a, b) => a.title.localeCompare(b.title));
}

/** The library as it is after the broker took the assignment. */
export function withOwners(
  library: LibraryBooks,
  itemIds: string[],
  ownerIds: string[],
  readers: LibraryOwner[],
): LibraryBooks {
  const ids = new Set(itemIds);
  const owners = readers.filter((r) => ownerIds.includes(r.id));
  return {
    books: library.books.map((b) => (ids.has(b.itemId) ? { ...b, owners } : b)),
  };
}

/** Books matched so far in the running import. */
export function matchedSoFar(status: ImportStatus): number {
  return status.matched + status.unmatched + status.failed;
}
