import { z } from 'zod';

export const Locale = z.enum(['en', 'nl']);
export type Locale = z.infer<typeof Locale>;

export const LoginRequest = z
  .object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .meta({ id: 'LoginRequest' });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const TokenPair = z
  .object({
    accessToken: z.string(),
    /** Seconds until the access token expires. */
    accessTokenExpiresIn: z.number().int().positive(),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.iso.datetime(),
  })
  .meta({ id: 'TokenPair' });
export type TokenPair = z.infer<typeof TokenPair>;

export const RefreshRequest = z
  .object({ refreshToken: z.string().min(1) })
  .meta({ id: 'RefreshRequest' });
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const LogoutRequest = RefreshRequest.meta({ id: 'LogoutRequest' });
export type LogoutRequest = z.infer<typeof LogoutRequest>;

export const Me = z
  .object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
    locale: Locale,
    kobo: z.object({ configured: z.boolean() }),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof Me>;

export const HealthCheckResult = z.object({
  name: z.string(),
  status: z.enum(['ok', 'fail']),
  error: z.string().optional(),
});

export const Health = z
  .object({
    /** Marks a Purrshelf broker, so the app can tell it apart from any other server. */
    service: z.literal('purrshelf-broker'),
    status: z.enum(['ok', 'degraded']),
    version: z.string(),
    checks: z.array(HealthCheckResult),
  })
  .meta({ id: 'Health' });
export type Health = z.infer<typeof Health>;

export const Empty = z.object({}).meta({ id: 'Empty' });

// --- Discover (BRK-02) ------------------------------------------------------

/** Kept on works and requests so audiobooks fit in later (ADR 0014). */
export const MediaType = z.enum(['ebook', 'audiobook']);
export type MediaType = z.infer<typeof MediaType>;

/** Metadata providers, in the order their data wins when hits are merged (ADR 0007). */
export const metadataProviders = ['hardcover', 'openlibrary', 'googlebooks'] as const;
export const MetadataProviderName = z.enum(metadataProviders);
export type MetadataProviderName = z.infer<typeof MetadataProviderName>;

/** Language chips on the search screen. */
export const SearchLanguage = z.enum(['any', 'en', 'nl']);
export type SearchLanguage = z.infer<typeof SearchLanguage>;

/** `<provider>:<provider id>`, for example `hardcover:123` or `openlibrary:OL27448W`. */
export const WorkId = z
  .string()
  .regex(/^(hardcover|openlibrary|googlebooks):[A-Za-z0-9_-]{1,64}$/, 'not a work id');
export type WorkId = z.infer<typeof WorkId>;

export const LibraryOwner = z.object({
  id: z.string(),
  displayName: z.string(),
  /** True for the user who asked. */
  me: z.boolean(),
});
export type LibraryOwner = z.infer<typeof LibraryOwner>;

export const ReadStatus = z.enum(['unread', 'reading', 'finished']);
export type ReadStatus = z.infer<typeof ReadStatus>;

/** The asking reader's progress, from their Kobo's sync data in CWA (APP-08). */
export const MyReading = z.object({
  status: ReadStatus,
  /** 0–100, null when the Kobo never reported a position. */
  progressPercent: z.number().nullable(),
});
export type MyReading = z.infer<typeof MyReading>;

/** Set when the book is already in the shared library (ADR 0009). */
export const LibraryState = z
  .object({
    itemId: z.string(),
    owners: z.array(LibraryOwner),
    onMyKobo: z.boolean(),
    /** My progress; null when my Kobo is not linked. */
    reading: MyReading.nullable(),
  })
  .meta({ id: 'LibraryState' });
export type LibraryState = z.infer<typeof LibraryState>;

export const SeriesRef = z.object({
  /** Provider-prefixed series id when the provider has one, e.g. `hardcover:42`. */
  id: z.string().nullable(),
  name: z.string(),
  /** Position in the series; can be fractional (2.5 for a novella). */
  position: z.number().nullable(),
  /** Number of main books in the series, when known. */
  total: z.number().int().nullable(),
});
export type SeriesRef = z.infer<typeof SeriesRef>;

export const WorkSource = z.object({ provider: MetadataProviderName, id: z.string() });
export type WorkSource = z.infer<typeof WorkSource>;

export const WorkSummary = z
  .object({
    id: WorkId,
    mediaType: MediaType,
    title: z.string(),
    subtitle: z.string().nullable(),
    authors: z.array(z.string()),
    /** ISO 639-1 code (`en`, `nl`, …) when a provider knows it. */
    language: z.string().nullable(),
    series: SeriesRef.nullable(),
    publishedYear: z.number().int().nullable(),
    /** ISBN-13s, normalised. */
    isbns: z.array(z.string()),
    /** Whether any provider has a cover; the image itself comes from the broker. */
    hasCover: z.boolean(),
    /** Every provider record merged into this hit, best first. */
    sources: z.array(WorkSource),
    library: LibraryState.nullable(),
  })
  .meta({ id: 'WorkSummary' });
export type WorkSummary = z.infer<typeof WorkSummary>;

export const DiscoverSearchQuery = z.object({
  /** Title, or any words from it. */
  q: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200).optional(),
  language: SearchLanguage.default('any'),
});
export type DiscoverSearchQuery = z.infer<typeof DiscoverSearchQuery>;

export const ProviderStatus = z.object({
  provider: MetadataProviderName,
  /** `skipped` when the provider is not configured on this server. */
  status: z.enum(['ok', 'failed', 'skipped']),
});
export type ProviderStatus = z.infer<typeof ProviderStatus>;

export const DiscoverSearchResult = z
  .object({
    hits: z.array(WorkSummary),
    providers: z.array(ProviderStatus),
  })
  .meta({ id: 'DiscoverSearchResult' });
export type DiscoverSearchResult = z.infer<typeof DiscoverSearchResult>;

export const WorkParams = z.object({ id: WorkId });
export type WorkParams = z.infer<typeof WorkParams>;

export const WorkDetail = WorkSummary.extend({
  description: z.string().nullable(),
  subjects: z.array(z.string()),
  pageCount: z.number().int().nullable(),
}).meta({ id: 'WorkDetail' });
export type WorkDetail = z.infer<typeof WorkDetail>;

export const SeriesEntry = z.object({
  position: z.number().nullable(),
  work: WorkSummary,
});
export type SeriesEntry = z.infer<typeof SeriesEntry>;

export const WorkSeries = z
  .object({
    series: z
      .object({ id: z.string().nullable(), name: z.string(), total: z.number().int().nullable() })
      .nullable(),
    entries: z.array(SeriesEntry),
  })
  .meta({ id: 'WorkSeries' });
export type WorkSeries = z.infer<typeof WorkSeries>;

// --- Similar books (APP-09) -------------------------------------------------

/** Why a book is suggested: same series first, then same author, then subject. */
export const SimilarReason = z.enum(['series', 'author', 'subject']);
export type SimilarReason = z.infer<typeof SimilarReason>;

export const SimilarWork = z.object({ reason: SimilarReason, work: WorkSummary });
export type SimilarWork = z.infer<typeof SimilarWork>;

export const SimilarWorks = z
  .object({
    /** At most 12, best first. Never includes the work itself. */
    works: z.array(SimilarWork),
  })
  .meta({ id: 'SimilarWorks' });
export type SimilarWorks = z.infer<typeof SimilarWorks>;

// --- Covers (BRK-07) --------------------------------------------------------

/** `s` for lists, `m` for grids, `l` for the detail page. */
export const CoverSize = z.enum(['s', 'm', 'l']);
export type CoverSize = z.infer<typeof CoverSize>;

export const CoverQuery = z.object({ size: CoverSize.default('m') });

// --- Kobos (APP-06) ---------------------------------------------------------

/**
 * Where a book stands on one reader's Kobo. `sending` and `removing` mean the
 * shelf has changed and the Kobo picks it up at its next sync.
 */
export const KoboState = z.enum([
  'on_device',
  'sending',
  'removing',
  'not_on_device',
  'not_set_up',
]);
export type KoboState = z.infer<typeof KoboState>;

export const ItemKobo = z.object({
  /** The reader whose Kobo this is. */
  userId: z.string(),
  displayName: z.string(),
  /** True for the user who asked. */
  me: z.boolean(),
  state: KoboState,
});
export type ItemKobo = z.infer<typeof ItemKobo>;

export const ItemKobos = z
  .object({
    /** Every reader's Kobo, the asking user's first. */
    kobos: z.array(ItemKobo),
  })
  .meta({ id: 'ItemKobos' });
export type ItemKobos = z.infer<typeof ItemKobos>;

export const ItemParams = z.object({ itemId: z.uuid() });
export type ItemParams = z.infer<typeof ItemParams>;

export const ItemKoboParams = ItemParams.extend({ userId: z.string().min(1).max(64) });
export type ItemKoboParams = z.infer<typeof ItemKoboParams>;

// --- Library (APP-07) -------------------------------------------------------

export const LibraryBookEntry = z.object({
  itemId: z.string(),
  /** Null for a Calibre book that no search hit has been matched to yet. */
  workId: WorkId.nullable(),
  mediaType: MediaType,
  title: z.string(),
  authors: z.array(z.string()),
  series: z.object({ name: z.string(), position: z.number().nullable() }).nullable(),
  addedAt: z.iso.datetime(),
  /** Oldest owner first; empty for a book nobody owns. */
  owners: z.array(LibraryOwner),
  onMyKobo: z.boolean(),
  /** The asking reader's progress from their Kobo; null when their Kobo is not linked. */
  reading: MyReading.nullable(),
});
export type LibraryBookEntry = z.infer<typeof LibraryBookEntry>;

export const LibraryBooks = z
  .object({
    /** Every book in the shared library, newest first. The app filters and sorts. */
    books: z.array(LibraryBookEntry),
  })
  .meta({ id: 'LibraryBooks' });
export type LibraryBooks = z.infer<typeof LibraryBooks>;

// --- Ownership (BRK-08) -----------------------------------------------------

export const ItemOwnership = z
  .object({
    itemId: z.string(),
    /** Oldest owner first. */
    owners: z.array(LibraryOwner),
    /**
     * Set when nobody owns the book any more: it is deleted from the library
     * at this time unless someone keeps it before then (ADR 0009).
     */
    deleteAfter: z.iso.datetime().nullable(),
  })
  .meta({ id: 'ItemOwnership' });
export type ItemOwnership = z.infer<typeof ItemOwnership>;
