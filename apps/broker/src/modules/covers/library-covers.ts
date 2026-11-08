/**
 * Covers of books that are already in the library (Calibre's cover.jpg).
 * The library stream implements this on top of the LibraryAdapter; until
 * then no work has a library cover.
 */
export interface LibraryCovers {
  /**
   * `key` must change when the cover changes (for example the Calibre book id
   * plus the file's modification time), so the stored sizes are rebuilt.
   */
  coverFor(workId: string): Promise<{ key: string; load: () => Promise<Buffer> } | null>;
}

export const noLibraryCovers: LibraryCovers = { coverFor: async () => null };
