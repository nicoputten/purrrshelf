import { z } from 'zod';
import { BookLanguage } from './requests.js';
import { WorkId } from './schemas.js';

/**
 * Why a search is unlikely to find a book (BRK-13, ADR 0041), strongest
 * first. The broker only sends the code; the app owns the text.
 */
export const lowOddsCodes = [
  /** A request for this work ended "not found" in the last 30 days. */
  'LOW_ODDS_NOT_FOUND',
  /** The metadata has no ISBN or edition for this work. */
  'LOW_ODDS_NO_MATCH',
  /** Published in the last 14 days, or not out yet. */
  'LOW_ODDS_NEW',
  /** The chosen language is not English. */
  'LOW_ODDS_LANGUAGE',
  /** Very few readers on Hardcover. */
  'LOW_ODDS_RARE',
] as const;
export const LowOddsCode = z.enum(lowOddsCodes);
export type LowOddsCode = z.infer<typeof LowOddsCode>;

/** Days a "not found" counts against a work. */
export const LOW_ODDS_NOT_FOUND_DAYS = 30;
/** A book published this many days ago or less (or not yet) is "very new". */
export const LOW_ODDS_NEW_DAYS = 14;
/** Fewer Hardcover readers than this makes a book "a rare one". */
export const LOW_ODDS_RARE_READERS = 10;

/** The one, strongest reason, with the facts the app's text needs. */
export const LowOdds = z
  .object({
    code: LowOddsCode,
    /** LOW_ODDS_NOT_FOUND: when the last search for this work found nothing. */
    notFoundAt: z.iso.datetime().nullable(),
    /** LOW_ODDS_NEW: the publication date (YYYY-MM-DD) when known. */
    releaseDate: z.iso.date().nullable(),
    /**
     * LOW_ODDS_LANGUAGE: a work with an English edition the reader can fetch
     * instead (this same work when it has an English edition); null hides the link.
     */
    englishEditionWorkId: WorkId.nullable(),
    /** LOW_ODDS_RARE: how many Hardcover readers the book has. */
    readers: z.number().int().nonnegative().nullable(),
  })
  .meta({ id: 'LowOdds' });
export type LowOdds = z.infer<typeof LowOdds>;

export const RequestPreviewQuery = z.object({
  workId: WorkId,
  language: BookLanguage,
});
export type RequestPreviewQuery = z.infer<typeof RequestPreviewQuery>;

/** What the Add sheet shows before Add. Free: never searches an indexer. */
export const RequestPreview = z
  .object({
    workId: WorkId,
    language: BookLanguage,
    /** Null when nothing predicts a poor chance (or the library already has the book). */
    lowOdds: LowOdds.nullable(),
  })
  .meta({ id: 'RequestPreview' });
export type RequestPreview = z.infer<typeof RequestPreview>;
