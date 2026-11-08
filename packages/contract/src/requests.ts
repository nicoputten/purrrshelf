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

/** Why a release is left out; the app translates these. */
export const RejectReason = z.enum([
  'format_excluded',
  'audiobook',
  'language_mismatch',
  'title_mismatch',
  'size_out_of_range',
  'failed_before',
]);
export type RejectReason = z.infer<typeof RejectReason>;

export const ReleaseFormat = z.enum(['epub', 'kepub', 'azw3', 'mobi', 'pdf', 'cbz', 'cbr']);
export type ReleaseFormat = z.infer<typeof ReleaseFormat>;

/** The release a request is downloading (or downloaded). */
export const PickedRelease = z.object({
  id: z.string(),
  title: z.string(),
  format: ReleaseFormat.nullable(),
  /** Bytes. */
  size: z.number().int().nullable(),
  language: z.enum(['en', 'nl', 'other']).nullable(),
});
export type PickedRelease = z.infer<typeof PickedRelease>;

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
    /** Indexer searches spent on this request so far. */
    searches: z.number().int().nonnegative(),
    /** Names of the indexers that were searched. */
    searchedOn: z.array(z.string()),
    release: PickedRelease.nullable(),
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

export const ReleaseOption = PickedRelease.extend({
  indexerName: z.string(),
  publishedAt: z.iso.datetime().nullable(),
  grabs: z.number().int().nullable(),
  /** 0–100; 0 when left out. */
  score: z.number(),
  /** Empty for a release that can be picked; otherwise why it is left out. */
  rejected: z.array(RejectReason),
  /** True for the release being downloaded (or downloaded). */
  picked: z.boolean(),
  titleMatch: z.boolean(),
  authorMatch: z.boolean(),
});
export type ReleaseOption = z.infer<typeof ReleaseOption>;

export const ReleaseList = z
  .object({
    /** Best first; left-out releases last. */
    releases: z.array(ReleaseOption),
    /** A release scoring at least this is "Good" (and is grabbed without asking). */
    acceptThreshold: z.number(),
  })
  .meta({ id: 'ReleaseList' });
export type ReleaseList = z.infer<typeof ReleaseList>;

export const RequestReleaseParams = z.object({
  id: z.string().min(1).max(64),
  releaseId: z.string().min(1).max(64),
});
export type RequestReleaseParams = z.infer<typeof RequestReleaseParams>;

/**
 * Live request updates are server-sent events, not JSON, so they are not in
 * `endpoints`. `GET /requests/events` needs the bearer token and sends one
 * `request` event (a {@link BookRequest}) whenever one of my requests changes.
 */
export const requestEventsPath = '/requests/events';
