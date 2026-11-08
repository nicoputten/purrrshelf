import type { LibraryState } from '@purrshelf/contract';

export interface LibraryCandidate {
  /** Caller's key for this candidate (the work id). */
  key: string;
  isbns: string[];
  title: string;
  authors: string[];
}

/**
 * Tells discover which hits are already in the shared library, who owns them
 * and whether they are on the asking user's Kobo. The library stream
 * implements this once `library_items` and ownership exist; until then the
 * library is empty.
 */
export interface LibraryLookup {
  match(userId: string, candidates: LibraryCandidate[]): Promise<Map<string, LibraryState>>;
}

export const emptyLibrary: LibraryLookup = {
  match: async () => new Map(),
};
