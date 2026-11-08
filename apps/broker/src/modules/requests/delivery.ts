import { eq } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { requests, users, type RequestRow } from '../../db/schema.js';
import type { LibraryOwner } from '../library/types.js';
import { assertTransition } from './status.js';

/**
 * Library items and ownership (ADR 0009). The library stream owns these
 * tables; until it is wired in, {@link noLibraryItems} records nothing.
 */
export interface LibraryItems {
  ensure(input: {
    workId: string;
    calibreBookId: number;
    title: string;
    mediaType: 'ebook';
  }): { id: string } | Promise<{ id: string }>;
  own(itemId: string, userId: string): void | Promise<void>;
}

export const noLibraryItems: LibraryItems = {
  ensure: () => ({ id: '' }),
  own: () => undefined,
};

/** The part of the library adapter (BRK-03) that puts a book on a reader's Kobo shelf. */
export interface KoboShelves {
  addToKoboShelf(owner: LibraryOwner, bookId: number): Promise<void>;
}

/**
 * The last step of a request: the book is in the library, so the asking user
 * owns it and it goes on the Kobo shelf of every chosen reader (APP-03).
 * Shelf IDs are looked up per reader by the adapter (ADR 0017).
 */
export class Delivery {
  constructor(
    private readonly db: Db,
    private readonly items: LibraryItems,
    private readonly shelves: KoboShelves | null,
    private readonly clock: Clock,
    private readonly notify: (request: RequestRow) => RequestRow,
  ) {}

  readonly deliver = async (request: RequestRow): Promise<RequestRow> => {
    if (request.status !== 'in_library' || request.calibreBookId === null) return request;
    const bookId = request.calibreBookId;
    const { title } = JSON.parse(request.queryJson) as { title: string };
    const item = await this.items.ensure({
      workId: request.workId,
      calibreBookId: bookId,
      title,
      // Requests are ebooks until audiobooks arrive; the library holds EPUB (ADR 0016).
      mediaType: 'ebook',
    });
    await this.items.own(item.id, request.userId);

    const pushTo = JSON.parse(request.pushToJson) as string[];
    if (pushTo.length === 0) return request;
    const problems: string[] = [];
    for (const userId of pushTo) {
      const problem = await this.push(userId, bookId);
      if (problem) problems.push(problem);
    }
    if (problems.length > 0) return this.update(request, { error: problems.join('; ') });
    assertTransition(request.status, 'pushed');
    return this.update(request, { status: 'pushed', error: null });
  };

  /** Puts the book on one reader's Kobo shelf; answers what went wrong, if anything. */
  private async push(userId: string, bookId: number): Promise<string | null> {
    const user = this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return `Reader ${userId} no longer exists`;
    if (user.cwaUserId === null) return `${user.displayName} is not linked to a CWA account`;
    if (!this.shelves) return 'The library is not set up yet';
    try {
      await this.shelves.addToKoboShelf({ cwaUserId: user.cwaUserId }, bookId);
      return null;
    } catch (err) {
      return `${user.displayName}'s Kobo: ${(err as Error).message}`;
    }
  }

  private update(
    request: RequestRow,
    set: { status?: 'pushed'; error: string | null },
  ): RequestRow {
    return this.notify(
      this.db
        .update(requests)
        .set({ ...set, updatedAt: this.clock() })
        .where(eq(requests.id, request.id))
        .returning()
        .get(),
    );
  }
}
