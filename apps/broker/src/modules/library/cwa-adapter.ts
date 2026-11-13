import { CalibreDb } from './calibre-db.js';
import { CwaAppDb, type CwaShelf } from './cwa-app-db.js';
import { CwaKoboApi, CwaWebSession, type Fetch } from './cwa-web.js';
import { bookNotFound, koboShelfMissing, koboSyncNotSetUp, libraryUnavailable } from './errors.js';
import type {
  DeviceState,
  FindBooksQuery,
  KoboSyncBook,
  LibraryAdapter,
  LibraryBook,
  LibraryOwner,
  ReadingState,
} from './types.js';

export interface CwaAdapterOptions {
  baseUrl: string;
  serviceUser: string;
  servicePassword: string;
  /** Name of each reader's own Kobo shelf (`CWA_KOBO_SHELF_NAME`). */
  koboShelfName: string;
  /** Calibre's metadata.db, opened read-only. */
  metadataDbPath: string;
  /** CWA's app.db, opened read-only. */
  appDbPath: string;
  fetch?: Fetch;
  timeoutMs?: number;
}

interface DeleteMessage {
  type?: string;
  message?: unknown;
}

/**
 * The library on Calibre-Web-Automated v4.0.8 (ADR 0017, ADR 0021).
 *
 * - Books, shelves, Kobo tokens and reading state are read straight from
 *   `metadata.db` and `app.db`, read-only.
 * - Shelf changes go through CWA's Kobo sync API as the shelf's owner,
 *   because CWA lets nobody but the owner change a private shelf.
 * - Deleting a book goes through CWA's web UI as the service account.
 */
export class CwaAdapter implements LibraryAdapter {
  readonly calibre: CalibreDb;
  readonly appDb: CwaAppDb;
  private readonly web: CwaWebSession;
  private readonly kobo: CwaKoboApi;

  constructor(private readonly opts: CwaAdapterOptions) {
    this.calibre = new CalibreDb(opts.metadataDbPath);
    this.appDb = new CwaAppDb(opts.appDbPath);
    this.web = new CwaWebSession({
      baseUrl: opts.baseUrl,
      username: opts.serviceUser,
      password: opts.servicePassword,
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
    });
    this.kobo = new CwaKoboApi({
      baseUrl: opts.baseUrl,
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
    });
  }

  async findBooks(query: FindBooksQuery): Promise<LibraryBook[]> {
    return this.calibre.findBooks(query);
  }

  async getBook(bookId: number): Promise<LibraryBook | null> {
    return this.calibre.getBook(bookId);
  }

  /**
   * Looks up the owner's Kobo shelf by owner + name, every time: shelf IDs
   * are never configured or hard-coded (ADR 0017). A missing, duplicated or
   * unsynced shelf is an error, never silently created or fixed.
   */
  resolveKoboShelf(owner: LibraryOwner): CwaShelf {
    const name = this.opts.koboShelfName;
    if (!this.appDb.userExists(owner.cwaUserId)) {
      throw libraryUnavailable(`CWA user ${owner.cwaUserId} does not exist`, {
        cwaUserId: owner.cwaUserId,
      });
    }
    const shelves = this.appDb.shelvesByName(owner.cwaUserId, name);
    const [shelf] = shelves;
    if (!shelf) throw koboShelfMissing(owner.cwaUserId, name, 'has no shelf');
    if (shelves.length > 1)
      throw koboShelfMissing(owner.cwaUserId, name, 'has more than one shelf');
    if (!shelf.koboSync) {
      throw koboShelfMissing(owner.cwaUserId, name, 'has Kobo sync switched off on the shelf');
    }
    return shelf;
  }

  async addToKoboShelf(owner: LibraryOwner, bookId: number): Promise<void> {
    const { shelf, token, book } = this.shelfChange(owner, bookId);
    await this.kobo.addToShelf(token, shelf.uuid, [book.uuid]);
    if (!this.appDb.deviceState(owner.cwaUserId, shelf.id, bookId).onKoboShelf) {
      throw libraryUnavailable('CWA accepted the shelf change but the book is not on the shelf', {
        bookId,
      });
    }
  }

  async removeFromKoboShelf(owner: LibraryOwner, bookId: number): Promise<void> {
    const { shelf, token, book } = this.shelfChange(owner, bookId);
    await this.kobo.removeFromShelf(token, shelf.uuid, [book.uuid]);
    if (this.appDb.deviceState(owner.cwaUserId, shelf.id, bookId).onKoboShelf) {
      throw libraryUnavailable('CWA accepted the shelf change but the book is still on the shelf', {
        bookId,
      });
    }
  }

  async getDeviceState(owner: LibraryOwner, bookId: number): Promise<DeviceState> {
    const shelf = this.resolveKoboShelf(owner);
    return this.appDb.deviceState(owner.cwaUserId, shelf.id, bookId);
  }

  async listKoboSync(owner: LibraryOwner): Promise<KoboSyncBook[]> {
    const shelf = this.resolveKoboShelf(owner);
    return this.appDb.koboSync(owner.cwaUserId, shelf.id);
  }

  async getReadingState(owner: LibraryOwner, bookId: number): Promise<ReadingState> {
    return this.appDb.readingState(owner.cwaUserId, bookId);
  }

  async getReadingStates(owner: LibraryOwner): Promise<Map<number, ReadingState>> {
    return this.appDb.readingStates(owner.cwaUserId);
  }

  async deleteBook(bookId: number): Promise<void> {
    if (!this.calibre.getBook(bookId)) throw bookNotFound(bookId);
    const res = await this.web.post(`/ajax/delete/${bookId}`);
    const text = await res.text();
    if (!res.ok) {
      throw libraryUnavailable('CWA refused to delete the book', { bookId, status: res.status });
    }
    const problem = parseDeleteMessages(text).find((m) => m.type === 'danger');
    if (problem) {
      throw libraryUnavailable('CWA could not delete the book', {
        bookId,
        cwaMessage: String(problem.message ?? ''),
      });
    }
    if (this.calibre.getBook(bookId)) {
      throw libraryUnavailable('CWA answered but the book is still in the library', { bookId });
    }
  }

  async ping(): Promise<void> {
    this.calibre.ping();
    this.appDb.ping();
    if (!this.web.loggedIn) await this.web.login();
  }

  close(): void {
    this.calibre.close();
    this.appDb.close();
  }

  private shelfChange(owner: LibraryOwner, bookId: number) {
    const shelf = this.resolveKoboShelf(owner);
    const token = this.appDb.koboToken(owner.cwaUserId);
    if (!token) throw koboSyncNotSetUp(owner.cwaUserId);
    const book = this.calibre.getBook(bookId);
    if (!book) throw bookNotFound(bookId);
    return { shelf, token, book };
  }
}

function parseDeleteMessages(text: string): DeleteMessage[] {
  try {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter((m): m is DeleteMessage => typeof m === 'object' && m !== null);
  } catch {
    return [];
  }
}
