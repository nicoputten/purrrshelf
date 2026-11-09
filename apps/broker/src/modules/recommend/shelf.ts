import type { User } from '../../db/schema.js';
import type { LibraryItems } from '../library/items.js';
import type { LibraryAdapter, LibraryBook, ReadingState } from '../library/types.js';
import type { ReaderBook, ReaderShelfBooks } from './types.js';

/** Calibre is asked for at most this many books per query. */
const BATCH = 500;

/**
 * A reader's own books with Calibre's metadata (authors, series, tags,
 * languages) and, when their Kobo is linked, their reading state, read in
 * bulk: one Calibre query per 500 books and one CWA query per reader.
 */
export class ReaderShelf {
  constructor(
    private readonly items: LibraryItems,
    private readonly library: LibraryAdapter | null,
  ) {}

  async books(user: User): Promise<ReaderShelfBooks> {
    const owned = this.items.ownedBy(user.id);
    const calibre = await this.calibreBooks(owned.map((o) => o.item.calibreBookId));
    const readingData = user.cwaUserId !== null && this.library !== null;
    const states: Map<number, ReadingState> =
      readingData && this.library
        ? await this.library.getReadingStates({ cwaUserId: user.cwaUserId as number })
        : new Map();

    const books = owned.map(({ item, ownedAt }): ReaderBook => {
      const book = calibre.get(item.calibreBookId);
      return {
        itemId: item.id,
        workId: item.workId,
        calibreBookId: item.calibreBookId,
        title: book?.title ?? item.title,
        authors: book?.authors ?? [],
        series: book?.series ?? null,
        isbns: book?.isbns ?? [],
        languages: book?.languages ?? [],
        tags: book?.tags ?? [],
        ownedAt,
        reading: readingData ? (states.get(item.calibreBookId) ?? unread) : null,
      };
    });
    return { books, readingData };
  }

  private async calibreBooks(ids: number[]): Promise<Map<number, LibraryBook>> {
    const map = new Map<number, LibraryBook>();
    if (!this.library) return map;
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      for (const book of await this.library.findBooks({ ids: chunk, limit: BATCH })) {
        map.set(book.id, book);
      }
    }
    return map;
  }
}

const unread: ReadingState = {
  status: 'unread',
  progressPercent: null,
  spentReadingMinutes: null,
  remainingMinutes: null,
  lastModified: null,
};
