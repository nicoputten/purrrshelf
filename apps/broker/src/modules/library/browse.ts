import type { LibraryBookEntry, LibraryBooks } from '@purrshelf/contract';
import type { User } from '../../db/schema.js';
import type { LibraryItems } from './items.js';
import type { LibraryAdapter, LibraryBook, LibraryOwner } from './types.js';

/** Calibre is asked for at most this many books per query. */
const BATCH = 500;

/**
 * The shared library for the Library tab (APP-07): every book with its
 * owners, whether it is on the asking reader's Kobo and how far they are.
 * The app splits it into Mine / Partner's / All and keeps a copy offline.
 */
export class LibraryBrowser {
  constructor(
    private readonly items: LibraryItems,
    private readonly library: LibraryAdapter | null,
    private readonly findUser: (id: string) => User | undefined,
  ) {}

  async books(userId: string): Promise<LibraryBooks> {
    const items = this.items.all();
    const owners = this.items.owners(items.map((i) => i.id));
    const calibre = await this.calibreBooks(items.map((i) => i.calibreBookId));
    const cwaUserId = this.findUser(userId)?.cwaUserId ?? null;
    const me: LibraryOwner | null = cwaUserId === null ? null : { cwaUserId };

    const books: LibraryBookEntry[] = [];
    for (const item of items) {
      const book = calibre.get(item.calibreBookId);
      books.push({
        itemId: item.id,
        workId: item.workId,
        mediaType: item.mediaType,
        title: book?.title ?? item.title,
        authors: book?.authors ?? [],
        series: book?.series ? { name: book.series.name, position: book.series.index } : null,
        addedAt: item.addedAt.toISOString(),
        owners: (owners.get(item.id) ?? []).map((o) => ({
          id: o.userId,
          displayName: o.displayName,
          me: o.userId === userId,
        })),
        ...(await this.mine(me, item.calibreBookId)),
      });
    }
    return { books };
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

  /** The asking reader's Kobo and progress; nothing when their Kobo is not linked or set up. */
  private async mine(
    me: LibraryOwner | null,
    bookId: number,
  ): Promise<Pick<LibraryBookEntry, 'onMyKobo' | 'reading'>> {
    if (!me || !this.library) return { onMyKobo: false, reading: null };
    const reading = await this.library.getReadingState(me, bookId);
    const onMyKobo = await this.library.getDeviceState(me, bookId).then(
      (s) => s.onKoboShelf,
      () => false,
    );
    return {
      onMyKobo,
      reading: { status: reading.status, progressPercent: reading.progressPercent },
    };
  }
}
