import type { ItemOwnership } from '@purrshelf/contract';
import { AppError } from '../../errors.js';
import type { User } from '../../db/schema.js';
import type { LibraryItems } from './items.js';
import type { LibraryAdapter } from './types.js';

/** A book nobody owns stays this long, so either reader can still keep it (ADR 0009). */
export const DELETE_GRACE_MS = 7 * 24 * 60 * 60_000;

/**
 * Adding a library book to my library and removing it again (BRK-08).
 * Removing also takes it off my Kobo shelf; when nobody owns the book any
 * more it is deleted after the grace period, and keeping it again undoes that.
 */
export class Ownership {
  constructor(
    private readonly items: LibraryItems,
    private readonly library: LibraryAdapter | null,
    private readonly findUser: (id: string) => User | undefined,
  ) {}

  keep(itemId: string, userId: string): ItemOwnership {
    this.item(itemId);
    this.items.own(itemId, userId);
    return this.state(itemId, userId);
  }

  async remove(itemId: string, userId: string): Promise<ItemOwnership> {
    const item = this.item(itemId);
    const cwaUserId = this.findUser(userId)?.cwaUserId ?? null;
    if (cwaUserId !== null && this.library) {
      // First off the Kobo shelf: if CWA refuses, nothing has changed yet.
      await this.library.removeFromKoboShelf({ cwaUserId }, item.calibreBookId).catch((err) => {
        // Without a Kobo shelf or sync token there is nothing to take off.
        if (
          err instanceof AppError &&
          (err.code === 'KOBO_SHELF_MISSING' || err.code === 'KOBO_SYNC_NOT_SET_UP')
        ) {
          return;
        }
        throw err;
      });
    }
    this.items.disown(itemId, userId, DELETE_GRACE_MS);
    return this.state(itemId, userId);
  }

  private item(itemId: string) {
    const item = this.items.get(itemId);
    if (!item) throw new AppError(404, 'NOT_FOUND', 'This book is not in the library');
    return item;
  }

  private state(itemId: string, userId: string): ItemOwnership {
    const item = this.item(itemId);
    return {
      itemId,
      owners: (this.items.owners([itemId]).get(itemId) ?? []).map((o) => ({
        id: o.userId,
        displayName: o.displayName,
        me: o.userId === userId,
      })),
      deleteAfter: item.deleteAfter?.toISOString() ?? null,
    };
  }
}
