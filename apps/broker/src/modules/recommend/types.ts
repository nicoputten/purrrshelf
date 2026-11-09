import type {
  LibraryState,
  RecommendationReason,
  RequestStatus,
  WorkSeries,
  WorkSummary,
} from '@purrshelf/contract';
import type { LibraryCandidate } from '../discover/library-lookup.js';
import type { ReadingState } from '../library/types.js';

/** One book a reader owns, as For you sees it (BRK-11). */
export interface ReaderBook {
  itemId: string;
  /** Null for an imported Calibre book no search hit was matched to. */
  workId: string | null;
  calibreBookId: number;
  title: string;
  authors: string[];
  series: { name: string; index: number } | null;
  isbns: string[];
  /** ISO 639-1 codes from Calibre. */
  languages: string[];
  tags: string[];
  /** When this reader got the book. */
  ownedAt: Date;
  /** From the reader's Kobo; null when their Kobo is not linked. */
  reading: ReadingState | null;
}

/** A reader's books, and whether their Kobo reading data is behind them. */
export interface ReaderShelfBooks {
  books: ReaderBook[];
  /** False when the reader's Kobo is not linked: suggestions then use owned books. */
  readingData: boolean;
}

/**
 * Where candidate books come from: the metadata providers (through the
 * discover module). Never an indexer (ADR 0005, ADR 0035).
 */
export interface WorkSource {
  getWork(userId: string, workId: string): Promise<WorkSummary>;
  getSeries(userId: string, workId: string): Promise<WorkSeries>;
  /** Throws METADATA_UNAVAILABLE when no provider answered. */
  byAuthor(userId: string, author: string): Promise<WorkSummary[]>;
  /** The work a library book is; throws when no provider answered. */
  matchWork(book: { title: string; authors: string[]; isbns: string[] }): Promise<string | null>;
  workSummary(workId: string): Promise<{ title: string; authors: string[] }>;
}

/** Fresh library state for suggestions (who owns them now, my Kobo, my progress). */
export interface LibraryMatcher {
  match(userId: string, candidates: LibraryCandidate[]): Promise<Map<string, LibraryState>>;
}

/** The reader's open requests by work id (what "Already requested" shows). */
export type OpenRequests = (userId: string) => Map<string, { id: string; status: RequestStatus }>;

/** A suggestion before it is filtered and decorated for one answer. */
export interface Candidate {
  work: WorkSummary;
  reason: RecommendationReason;
}

/** The series and author rows as cached (ADR 0035). */
export interface ComputedRows {
  nextInSeries: Candidate[];
  author: Candidate[];
}
