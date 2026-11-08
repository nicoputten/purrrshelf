import { AppError } from '../../errors.js';

/** CWA or its databases can't be reached or answered something unexpected. */
export function libraryUnavailable(message: string, details?: unknown): AppError {
  return new AppError(502, 'LIBRARY_UNAVAILABLE', message, details);
}

/** The reader has no shelf named `CWA_KOBO_SHELF_NAME` (ADR 0017: never created silently). */
export function koboShelfMissing(cwaUserId: number, shelfName: string, reason: string): AppError {
  return new AppError(
    409,
    'KOBO_SHELF_MISSING',
    `CWA user ${cwaUserId} ${reason} named "${shelfName}"`,
    { cwaUserId, shelfName },
  );
}

/** The reader never created a Kobo sync token in CWA, so shelf changes can't be made as them. */
export function koboSyncNotSetUp(cwaUserId: number): AppError {
  return new AppError(
    409,
    'KOBO_SYNC_NOT_SET_UP',
    `CWA user ${cwaUserId} has no Kobo sync token; set up Kobo sync in CWA first`,
    { cwaUserId },
  );
}

export function bookNotFound(bookId: number): AppError {
  return new AppError(404, 'NOT_FOUND', `Book ${bookId} is not in the library`, { bookId });
}
