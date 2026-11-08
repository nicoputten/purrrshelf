import type { LibraryState } from '@purrshelf/contract';
import type { LibraryItemRow, User } from '../../db/schema.js';
import type { LibraryCandidate, LibraryLookup } from '../discover/library-lookup.js';
import type { LibraryItems } from './items.js';
import { normaliseIsbn } from './calibre-db.js';
import type { LibraryAdapter } from './types.js';

/**
 * Which search hits are already in the shared library (ADR 0009): first by
 * work id, then by ISBN in Calibre. A Calibre book found by ISBN gets its
 * library item (and work id) on first sight, so the book page can act on it.
 */
export class ItemLibraryLookup implements LibraryLookup {
  constructor(
    private readonly items: LibraryItems,
    private readonly library: LibraryAdapter,
    private readonly findUser: (id: string) => User | undefined,
  ) {}

  async match(userId: string, candidates: LibraryCandidate[]): Promise<Map<string, LibraryState>> {
    const byKey = new Map<string, LibraryItemRow>();
    for (const item of this.items.byWorkIds(candidates.map((c) => c.key))) {
      // Two Calibre copies of one work: the first one found stands for it.
      const key = item.workId as string;
      if (!byKey.has(key)) byKey.set(key, item);
    }
    await this.matchByIsbn(
      candidates.filter((c) => !byKey.has(c.key)),
      byKey,
    );

    const result = new Map<string, LibraryState>();
    if (byKey.size === 0) return result;
    const owners = this.items.owners([...byKey.values()].map((i) => i.id));
    const cwaUserId = this.findUser(userId)?.cwaUserId ?? null;
    for (const [key, item] of byKey) {
      result.set(key, {
        itemId: item.id,
        owners: (owners.get(item.id) ?? []).map((o) => ({
          id: o.userId,
          displayName: o.displayName,
          me: o.userId === userId,
        })),
        onMyKobo: await this.onKobo(cwaUserId, item.calibreBookId),
      });
    }
    return result;
  }

  private async matchByIsbn(
    candidates: LibraryCandidate[],
    byKey: Map<string, LibraryItemRow>,
  ): Promise<void> {
    const isbns = [...new Set(candidates.flatMap((c) => c.isbns.map(normaliseIsbn)))].filter(
      Boolean,
    );
    if (isbns.length === 0) return;
    // Search keeps working while the library is down; it just shows nothing as owned.
    const books = await this.library.findBooks({ isbns }).catch(() => []);
    for (const candidate of candidates) {
      const wanted = new Set(candidate.isbns.map(normaliseIsbn));
      const book = books.find((b) => b.isbns.some((i) => wanted.has(i)));
      if (!book) continue;
      byKey.set(
        candidate.key,
        this.items.ensure({ workId: candidate.key, calibreBookId: book.id, title: book.title }),
      );
    }
  }

  /** On the reader's Kobo shelf; a reader without a working Kobo setup simply has nothing on it. */
  private async onKobo(cwaUserId: number | null, calibreBookId: number): Promise<boolean> {
    if (cwaUserId === null) return false;
    try {
      return (await this.library.getDeviceState({ cwaUserId }, calibreBookId)).onKoboShelf;
    } catch {
      return false;
    }
  }
}
