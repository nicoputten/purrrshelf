import type { ItemKobo, ItemKobos, KoboState } from '@purrshelf/contract';
import { AppError } from '../../errors.js';
import type { User } from '../../db/schema.js';
import type { LibraryItems } from './items.js';
import { libraryUnavailable } from './errors.js';
import type { DeviceState, LibraryAdapter } from './types.js';

export interface KoboUsers {
  list(): User[];
  findById(id: string): User | undefined;
}

/**
 * Shelf state → what the reader sees. A changed shelf reaches the Kobo at
 * its next sync, so until then the book is `sending` or `removing`.
 */
export function koboState({ onKoboShelf, syncedToDevice }: DeviceState): KoboState {
  if (onKoboShelf) return syncedToDevice ? 'on_device' : 'sending';
  return syncedToDevice ? 'removing' : 'not_on_device';
}

/**
 * Which Kobos a library book is on, and sending it to or taking it off any
 * reader's Kobo (APP-06). Either reader may send a book to either Kobo;
 * sending also makes that reader an owner (ADR 0009). Removing from a Kobo
 * keeps the book and its owners.
 */
export class Kobos {
  constructor(
    private readonly items: LibraryItems,
    private readonly users: KoboUsers,
    private readonly library: LibraryAdapter | null,
  ) {}

  async list(itemId: string, askingUserId: string): Promise<ItemKobos> {
    const item = this.item(itemId);
    const readers = [...this.users.list()].sort(
      (a, b) =>
        Number(b.id === askingUserId) - Number(a.id === askingUserId) ||
        a.displayName.localeCompare(b.displayName),
    );
    const kobos: ItemKobo[] = [];
    for (const user of readers) {
      kobos.push({
        userId: user.id,
        displayName: user.displayName,
        me: user.id === askingUserId,
        state: await this.stateOf(user, item.calibreBookId),
      });
    }
    return { kobos };
  }

  async send(itemId: string, userId: string, askingUserId: string): Promise<ItemKobos> {
    const { item, cwaUserId, library } = this.target(itemId, userId);
    await library.addToKoboShelf({ cwaUserId }, item.calibreBookId);
    this.items.own(item.id, userId);
    return this.list(itemId, askingUserId);
  }

  async remove(itemId: string, userId: string, askingUserId: string): Promise<ItemKobos> {
    const { item, cwaUserId, library } = this.target(itemId, userId);
    await library.removeFromKoboShelf({ cwaUserId }, item.calibreBookId);
    return this.list(itemId, askingUserId);
  }

  private item(itemId: string) {
    const item = this.items.get(itemId);
    if (!item) throw new AppError(404, 'NOT_FOUND', 'This book is not in the library');
    return item;
  }

  private target(itemId: string, userId: string) {
    const item = this.item(itemId);
    const user = this.users.findById(userId);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'No such reader');
    if (user.cwaUserId === null) {
      throw new AppError(409, 'KOBO_NOT_LINKED', `${user.displayName} has no Kobo linked yet`, {
        userId,
      });
    }
    return { item, cwaUserId: user.cwaUserId, library: this.requireLibrary() };
  }

  private async stateOf(user: User, calibreBookId: number): Promise<KoboState> {
    if (user.cwaUserId === null) return 'not_set_up';
    try {
      return koboState(
        await this.requireLibrary().getDeviceState({ cwaUserId: user.cwaUserId }, calibreBookId),
      );
    } catch (err) {
      // One reader's missing shelf must not hide the other reader's Kobo.
      if (err instanceof AppError && err.code === 'KOBO_SHELF_MISSING') return 'not_set_up';
      throw err;
    }
  }

  private requireLibrary(): LibraryAdapter {
    if (!this.library) throw libraryUnavailable('The library (CWA) is not configured');
    return this.library;
  }
}
