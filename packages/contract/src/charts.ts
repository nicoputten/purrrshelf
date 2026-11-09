import { z } from 'zod';
import { RequestStatus } from './requests.js';
import { WorkSummary } from './schemas.js';

// --- Top 10s: genre charts (BRK-12, ADR 0039) -------------------------------

/**
 * Where a chart comes from: `apple` is the Apple Books ebook bestseller chart
 * of one country; `hardcover` is what Hardcover readers finish most this month.
 */
export const chartSources = ['apple', 'hardcover'] as const;
export const ChartSource = z.enum(chartSources);
export type ChartSource = z.infer<typeof ChartSource>;

/** Apple Books country charts: Dutch for Dutch readers, US for English readers. */
export const chartRegions = ['nl', 'us'] as const;
export const ChartRegion = z.enum(chartRegions);
export type ChartRegion = z.infer<typeof ChartRegion>;

/**
 * The genres the broker sorts chart books into; `all` is the whole chart.
 * The app translates the key, so labels never come from a source.
 */
export const chartGenres = [
  'all',
  'thriller',
  'romance',
  'literary',
  'historical',
  'fantasy_scifi',
  'biography',
  'nonfiction',
] as const;
export const ChartGenre = z.enum(chartGenres);
export type ChartGenre = z.infer<typeof ChartGenre>;

export const ChartEntry = z.object({
  /** 1 to 10 within this genre's list. */
  rank: z.number().int().positive(),
  /** As the source names it (a Dutch chart has Dutch titles). */
  title: z.string(),
  authors: z.array(z.string()),
  /**
   * The matching book, which opens the existing book page. Null when no
   * metadata provider knows it: the app then searches for "author title".
   */
  work: WorkSummary.nullable(),
  /** The reader's open request for this book, if they already added it. */
  request: z.object({ id: z.string(), status: RequestStatus }).nullable(),
});
export type ChartEntry = z.infer<typeof ChartEntry>;

export const Chart = z.object({
  source: ChartSource,
  /** Set on `apple` charts; null on `hardcover`. */
  region: ChartRegion.nullable(),
  genre: ChartGenre,
  /** At most 10, best first; a genre with no books today is left out. */
  items: z.array(ChartEntry),
});
export type Chart = z.infer<typeof Chart>;

export const Charts = z
  .object({
    /**
     * The reader's charts: Apple charts for the languages they read (their
     * own language first), then Hardcover trending. Genres in the order of
     * {@link chartGenres}.
     */
    charts: z.array(Chart),
    /** When the oldest chart in this answer was fetched. */
    updatedAt: z.iso.datetime(),
    /** True when a refresh failed and these are the last good charts. */
    stale: z.boolean(),
  })
  .meta({ id: 'Charts' });
export type Charts = z.infer<typeof Charts>;
