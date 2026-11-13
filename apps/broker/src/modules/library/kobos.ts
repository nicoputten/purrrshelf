import type { ItemKobo, ItemKobos, KoboState } from '@purrshelf/contract';
import { AppError } from '../../errors.js';
import type { KoboResendPhase, User } from '../../db/schema.js';
import type { LibraryItems } from './items.js';
import { libraryUnavailable } from './errors.js';
import type { DeviceState, LibraryAdapter } from './types.js';

export interface KoboUsers {
  list(): User[];
  findById(id: string): User | undefined;
}

/** What Kobos needs from the resend job (BRK-16). */
export interface KoboResends {
  phaseOf(userId: string, calibreBookId: number): KoboResendPhase | null;
  cancel(userId: string, calibreBookId: number): void;
}

/**
 * Shelf state → what the reader sees. A changed shelf reaches the Kobo at
 * its next sync, so until then the book is `sending` or `removing`. A book
 * is only `on_device` once the Kobo really has it (ADR 0046); a book the
 * broker took off the shelf to resend it is still `sending`.
 */
export function koboState(
  { onKoboShelf, syncedToDevice, deliveredToDevice }: DeviceState,
  resending = false,
): KoboState {
  if (onKoboShelf) return syncedToDevice && deliveredToDevice ? 'on_device' : 'sending';
  if (resending) return 'sending';
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
    private readonly resends?: KoboResends,
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
    this.resends?.cancel(userId, item.calibreBookId);
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
        this.resends?.phaseOf(user.id, calibreBookId) === 'off_shelf',
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
