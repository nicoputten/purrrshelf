import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { libraryItems, ownerships, users, type LibraryItemRow } from '../../db/schema.js';
import type { MediaType } from './types.js';

export interface NewLibraryItem {
  workId: string | null;
  calibreBookId: number;
  title: string;
  mediaType?: MediaType;
}

export interface ItemOwner {
  userId: string;
  displayName: string;
}

/**
 * The broker's records of library books and who owns them (ADR 0009). One
 * item per Calibre book; ownership is per user.
 */
export class LibraryItems {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** The item for this Calibre book, created on first use. A missing work id is filled in. */
  ensure(input: NewLibraryItem): LibraryItemRow {
    const existing = this.byCalibreId(input.calibreBookId);
    if (existing) {
      if (!existing.workId && input.workId) {
        this.db
          .update(libraryItems)
          .set({ workId: input.workId })
          .where(eq(libraryItems.id, existing.id))
          .run();
        return { ...existing, workId: input.workId };
      }
      return existing;
    }
    const row: LibraryItemRow = {
      id: randomUUID(),
      workId: input.workId,
      calibreBookId: input.calibreBookId,
      mediaType: input.mediaType ?? 'ebook',
      title: input.title,
      addedAt: this.clock(),
      deleteAfter: null,
    };
    this.db.insert(libraryItems).values(row).run();
    return row;
  }

  get(id: string): LibraryItemRow | undefined {
    return this.db.select().from(libraryItems).where(eq(libraryItems.id, id)).get();
  }

  byCalibreId(calibreBookId: number): LibraryItemRow | undefined {
    return this.db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.calibreBookId, calibreBookId))
      .get();
  }

  byWorkIds(workIds: string[]): LibraryItemRow[] {
    if (workIds.length === 0) return [];
    return this.db.select().from(libraryItems).where(inArray(libraryItems.workId, workIds)).all();
  }

  byCalibreIds(calibreBookIds: number[]): LibraryItemRow[] {
    if (calibreBookIds.length === 0) return [];
    return this.db
      .select()
      .from(libraryItems)
      .where(inArray(libraryItems.calibreBookId, calibreBookIds))
      .all();
  }

  /** Makes the user an owner (idempotent) and cancels a pending deletion. */
  own(itemId: string, userId: string): void {
    this.db
      .insert(ownerships)
      .values({ itemId, userId, addedAt: this.clock() })
      .onConflictDoNothing()
      .run();
    this.db
      .update(libraryItems)
      .set({ deleteAfter: null })
      .where(eq(libraryItems.id, itemId))
      .run();
  }

  /** Owners of each item, oldest owner first. */
  owners(itemIds: string[]): Map<string, ItemOwner[]> {
    const map = new Map<string, ItemOwner[]>();
    if (itemIds.length === 0) return map;
    const rows = this.db
      .select({
        itemId: ownerships.itemId,
        userId: ownerships.userId,
        displayName: users.displayName,
      })
      .from(ownerships)
      .innerJoin(users, eq(users.id, ownerships.userId))
      .where(inArray(ownerships.itemId, itemIds))
      .orderBy(asc(ownerships.addedAt), asc(users.displayName))
      .all();
    for (const { itemId, ...owner } of rows) {
      const list = map.get(itemId);
      if (list) list.push(owner);
      else map.set(itemId, [owner]);
    }
    return map;
  }

  isOwner(itemId: string, userId: string): boolean {
    return (
      this.db
        .select({ itemId: ownerships.itemId })
        .from(ownerships)
        .where(and(eq(ownerships.itemId, itemId), eq(ownerships.userId, userId)))
        .get() !== undefined
    );
  }
}
