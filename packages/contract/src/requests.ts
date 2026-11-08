import { z } from 'zod';
import { MediaType, WorkId } from './schemas.js';

/**
 * The life of one "add a book" request (BRK-05, BRK-06). `pushed` means the
 * book is on every chosen reader's Kobo shelf and arrives at the next sync.
 */
export const requestStatuses = [
  'searching',
  'waiting_budget',
  'not_found',
  'choose_release',
  'downloading',
  'download_failed',
  'importing',
  'import_failed',
  'in_library',
  'pushed',
  'cancelled',
] as const;
export const RequestStatus = z.enum(requestStatuses);
export type RequestStatus = z.infer<typeof RequestStatus>;

/** Statuses that will not change again on their own. */
export const settledStatuses: readonly RequestStatus[] = [
  'not_found',
  'choose_release',
  'download_failed',
  'import_failed',
  'in_library',
  'pushed',
  'cancelled',
];

/** Query variants the broker tries per indexer before it gives up (book, author + title, title, ISBN). */
export const MAX_SEARCHES_PER_INDEXER = 4;

export const BookLanguage = z.enum(['en', 'nl']);
export type BookLanguage = z.infer<typeof BookLanguage>;

export const AddRequest = z
  .object({
    workId: WorkId,
    language: BookLanguage,
    /** Readers (user ids) whose Kobo gets the book once it is in the library. */
    pushTo: z.array(z.string().min(1)).max(10),
  })
  .meta({ id: 'AddRequest' });
export type AddRequest = z.infer<typeof AddRequest>;

export const BookRequest = z
  .object({
    id: z.string(),
    workId: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    language: BookLanguage,
    mediaType: MediaType,
    status: RequestStatus,
    /** Download progress 0–100; null outside a download. */
    progress: z.number().int().min(0).max(100).nullable(),
    /** Why the request stopped (not found, failed, a Kobo that could not be reached). */
    error: z.string().nullable(),
    pushTo: z.array(z.string()),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'BookRequest' });
export type BookRequest = z.infer<typeof BookRequest>;

export const RequestList = z.object({ requests: z.array(BookRequest) }).meta({ id: 'RequestList' });
export type RequestList = z.infer<typeof RequestList>;

export const RequestParams = z.object({ id: z.string().min(1).max(64) });
export type RequestParams = z.infer<typeof RequestParams>;

/** A reader of this server, as a Kobo target for a new book. */
export const Reader = z.object({
  id: z.string(),
  displayName: z.string(),
  /** True for the user who asked. */
  me: z.boolean(),
  /** The reader is linked to a CWA account, so the broker can put books on their Kobo shelf. */
  kobo: z.boolean(),
});
export type Reader = z.infer<typeof Reader>;

export const Readers = z.object({ readers: z.array(Reader) }).meta({ id: 'Readers' });
export type Readers = z.infer<typeof Readers>;
