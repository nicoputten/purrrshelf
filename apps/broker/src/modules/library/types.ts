/**
 * The broker's view of the library. Everything that talks to CWA (or a later
 * library server) sits behind this interface, so the rest of the broker never
 * depends on CWA's web forms or database layout (BRK-03, ADR 0003).
 */

/** A CWA user, identified by CWA's own user id (`users.cwa_user_id`). */
export interface LibraryOwner {
  cwaUserId: number;
}

export type MediaType = 'ebook';

export interface LibraryBook {
  /** Calibre book id (`books.id` in metadata.db). */
  id: number;
  /** Calibre book uuid; also the id Kobo sync uses for the book. */
  uuid: string;
  mediaType: MediaType;
  title: string;
  authors: string[];
  series: { name: string; index: number } | null;
  isbns: string[];
  /** Upper-case Calibre formats, e.g. `["EPUB"]`. The library stores EPUB (ADR 0016). */
  formats: string[];
  /** Folder of the book relative to the library root. */
  path: string;
  addedAt: Date;
}

export interface FindBooksQuery {
  ids?: number[];
  uuids?: string[];
  /** Matched against identifiers of type isbn, isbn10 or isbn13, digits only. */
  isbns?: string[];
  /** Case-insensitive substring of the title. */
  title?: string;
  /** Case-insensitive substring of any author's name. */
  author?: string;
  /** A Calibre identifier, e.g. `{ type: 'kobopush', value: '<request id>' }`; type compared lower-case. */
  identifier?: { type: string; value: string };
  limit?: number;
}

export interface DeviceState {
  /** The book is on the owner's Kobo shelf in CWA. */
  onKoboShelf: boolean;
  /** CWA has handed the book to the owner's Kobo in a sync. */
  syncedToDevice: boolean;
}

export type ReadStatus = 'unread' | 'reading' | 'finished';

export interface ReadingState {
  status: ReadStatus;
  /** 0–100, from the Kobo's last bookmark; null when the Kobo never reported one. */
  progressPercent: number | null;
  spentReadingMinutes: number | null;
  remainingMinutes: number | null;
  /** When CWA last heard about this book's progress. */
  lastModified: Date | null;
}

export interface LibraryAdapter {
  findBooks(query: FindBooksQuery): Promise<LibraryBook[]>;
  getBook(bookId: number): Promise<LibraryBook | null>;
  /** Idempotent: adding a book that is already on the shelf is fine. */
  addToKoboShelf(owner: LibraryOwner, bookId: number): Promise<void>;
  /** Idempotent: removing a book that is not on the shelf is fine. */
  removeFromKoboShelf(owner: LibraryOwner, bookId: number): Promise<void>;
  getDeviceState(owner: LibraryOwner, bookId: number): Promise<DeviceState>;
  getReadingState(owner: LibraryOwner, bookId: number): Promise<ReadingState>;
  /** Deletes the book and its files from the library. Only for books nobody owns (ADR 0009). */
  deleteBook(bookId: number): Promise<void>;
  /** Cheap check for /health. */
  ping(): Promise<void>;
}
