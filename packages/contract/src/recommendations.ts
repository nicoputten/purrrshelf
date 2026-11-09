import { z } from 'zod';
import { RequestStatus } from './requests.js';
import { WorkId, WorkSummary } from './schemas.js';

// --- Recommendations: "For you" (BRK-11, ADR 0035) --------------------------

/** The three v1 rows, always in this order; a row with nothing in it is left out. */
export const recommendationRowKinds = ['next_in_series', 'author', 'partner_shelf'] as const;
export const RecommendationRowKind = z.enum(recommendationRowKinds);
export type RecommendationRowKind = z.infer<typeof RecommendationRowKind>;

/** Another reader of this server, by display name (never hard-coded in the app). */
export const RecommendationReader = z.object({ id: z.string(), displayName: z.string() });
export type RecommendationReader = z.infer<typeof RecommendationReader>;

/**
 * What a suggestion is based on. `finished` and `reading` come from the
 * reader's Kobo; `owned` is used when their Kobo is not linked.
 */
export const RecommendationBasis = z.enum(['finished', 'reading', 'owned']);
export type RecommendationBasis = z.infer<typeof RecommendationBasis>;

/**
 * Why a book is suggested, with what the app needs for the one-line reason
 * ("Seven Sisters 6 · you're reading 5", "You finished 3 books by her",
 * "<partner> finished it"). The app builds the sentence; the broker gives facts.
 */
export const RecommendationReason = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('next_in_series'),
    series: z.object({ name: z.string(), position: z.number().nullable() }),
    /** The reader's furthest book in the series. */
    after: z.object({
      title: z.string(),
      position: z.number().nullable(),
      basis: RecommendationBasis,
    }),
  }),
  z.object({
    kind: z.literal('author'),
    author: z.string(),
    basis: RecommendationBasis,
    /** How many of this author's books the reader finished (or owns, for `owned`). */
    count: z.number().int().positive(),
    /** The one book, when `count` is 1 ("You finished Think Twice"). */
    title: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('partner_shelf'),
    partner: RecommendationReader,
    /** True when the partner finished it; otherwise it is just on their shelf. */
    partnerFinished: z.boolean(),
  }),
]);
export type RecommendationReason = z.infer<typeof RecommendationReason>;

export const Recommendation = z.object({
  /** Opens the existing book page; `work.library` says whether a partner already has it. */
  work: WorkSummary,
  reason: RecommendationReason,
  /** Published this year or last year (providers only know the year): the "New" badge. */
  isNew: z.boolean(),
  /** The reader's open request for this book, if they already added it. */
  request: z.object({ id: z.string(), status: RequestStatus }).nullable(),
});
export type Recommendation = z.infer<typeof Recommendation>;

export const RecommendationRow = z.object({
  kind: RecommendationRowKind,
  /** Set on `partner_shelf` rows: whose shelf it is. */
  partner: RecommendationReader.nullable(),
  /** At most 10, best first. */
  items: z.array(Recommendation),
});
export type RecommendationRow = z.infer<typeof RecommendationRow>;

export const Recommendations = z
  .object({
    /** Non-empty rows only, in the order of {@link recommendationRowKinds}. */
    rows: z.array(RecommendationRow),
    /**
     * False when the reader's Kobo is not linked: rows then come from owned
     * books and the app shows "Link your Kobo for better picks".
     */
    readingData: z.boolean(),
    /** When the series and author rows were worked out. */
    computedAt: z.iso.datetime(),
    /** True when a refresh failed and these are the last good rows ("Couldn't refresh"). */
    stale: z.boolean(),
  })
  .meta({ id: 'Recommendations' });
export type Recommendations = z.infer<typeof Recommendations>;

/** `book` hides this one book for good; `author` shows fewer books by its first author. */
export const DismissKind = z.enum(['book', 'author']);
export type DismissKind = z.infer<typeof DismissKind>;

export const DismissRequest = z.object({ kind: DismissKind }).meta({ id: 'DismissRequest' });
export type DismissRequest = z.infer<typeof DismissRequest>;

export const DismissParams = z.object({ workId: WorkId });
export type DismissParams = z.infer<typeof DismissParams>;

export const Dismissal = z
  .object({
    workId: WorkId,
    kind: DismissKind,
    /** The author shown fewer, for `author`. */
    author: z.string().nullable(),
    /** When an `author` dismissal stops counting; null for `book` (that one is for good). */
    expiresAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Dismissal' });
export type Dismissal = z.infer<typeof Dismissal>;

export const DismissalsRemoved = z
  .object({ removed: z.number().int() })
  .meta({ id: 'DismissalsRemoved' });
export type DismissalsRemoved = z.infer<typeof DismissalsRemoved>;
