import { AppError } from '../../errors.js';
import type { User } from '../../db/schema.js';
import type { LibraryItems } from './items.js';
import { DELETE_GRACE_MS } from './ownership.js';
import type { LibraryAdapter } from './types.js';

/** Errors that mean the book is not on that reader's Kobo shelf to begin with. */
const NOTHING_ON_THE_SHELF = new Set(['KOBO_SHELF_MISSING', 'KOBO_SYNC_NOT_SET_UP']);

/**
 * Takes a wrong book away again (BRK-19, ADR 0048). Kobo shelves go first:
 * if CWA refuses, nothing else has changed yet and the reader can try again.
 */
export class BookDiscard {
  constructor(
    private readonly items: LibraryItems,
    private readonly library: LibraryAdapter | null,
    private readonly findUser: (id: string) => User | undefined,
  ) {}

  /**
   * A book the request imported: off the Kobo shelf of every owner and of
   * `readers`, deleted from the library, its item forgotten.
   */
  async discard(calibreBookId: number, readers: string[]): Promise<void> {
    const library = this.need();
    const item = this.items.byCalibreId(calibreBookId);
    const owners = item ? (this.items.owners([item.id]).get(item.id) ?? []) : [];
    await this.offShelves(library, calibreBookId, [...owners.map((o) => o.userId), ...readers]);
    await library.deleteBook(calibreBookId).catch((err: unknown) => {
      // Already gone from Calibre (deleted by hand): nothing left to delete.
      if (!(err instanceof AppError && err.code === 'NOT_FOUND')) throw err;
    });
    if (item) this.items.remove(item.id);
  }

  /**
   * A book that was in the library before the request: it may be right for
   * someone else, so it only leaves `userId`'s library and the Kobo shelves
   * of `readers` who don't own it. Never deleted here; the daily cleanup
   * handles a book nobody owns (BRK-08).
   */
  async dropFor(calibreBookId: number, userId: string, readers: string[]): Promise<void> {
    const library = this.need();
    const item = this.items.byCalibreId(calibreBookId);
    const keepers = new Set(
      item
        ? (this.items.owners([item.id]).get(item.id) ?? [])
            .map((o) => o.userId)
            .filter((id) => id !== userId)
        : [],
    );
    await this.offShelves(
      library,
      calibreBookId,
      [userId, ...readers].filter((id) => !keepers.has(id)),
    );
    if (item) this.items.disown(item.id, userId, DELETE_GRACE_MS);
  }

  private need(): LibraryAdapter {
    if (!this.library) {
      throw new AppError(502, 'LIBRARY_UNAVAILABLE', 'The library is not set up yet');
    }
    return this.library;
  }

  private async offShelves(
    library: LibraryAdapter,
    calibreBookId: number,
    userIds: string[],
  ): Promise<void> {
    for (const userId of new Set(userIds)) {
      const cwaUserId = this.findUser(userId)?.cwaUserId ?? null;
      if (cwaUserId === null) continue;
      await library.removeFromKoboShelf({ cwaUserId }, calibreBookId).catch((err: unknown) => {
        if (err instanceof AppError && NOTHING_ON_THE_SHELF.has(err.code)) return;
        throw err;
      });
    }
  }
}
