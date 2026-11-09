import type { ChartRegion } from '@purrshelf/contract';
import { z } from 'zod';
import { ProviderError, requestJson, type HttpOptions } from '../discover/http.js';

/** Apple's marketing feeds: public, no key. */
export const APPLE_FEED_HOST = 'rss.marketingtools.apple.com';
/** The most a feed gives. */
export const APPLE_FEED_SIZE = 100;

export function appleFeedUrl(region: ChartRegion, size = APPLE_FEED_SIZE): string {
  return `https://${APPLE_FEED_HOST}/api/v2/${region}/books/top-paid/${size}/books.json`;
}

/** One book on the Apple Books top paid chart, in chart order. */
export interface AppleEntry {
  title: string;
  authors: string[];
  genreIds: number[];
}

const Result = z.object({
  name: z.string().min(1),
  artistName: z.string().nullish().catch(null),
  genres: z
    .array(z.object({ genreId: z.coerce.number() }).nullable().catch(null))
    .nullish()
    .catch(null),
});

const Feed = z.object({
  feed: z.object({ results: z.array(z.unknown()) }),
});

/** "Lee Child & Andrew Child" or "A, B & C" → each name. */
export function splitAuthors(artistName: string | null | undefined): string[] {
  return (artistName ?? '')
    .split(/\s*(?:&|,)\s*/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * The Apple Books ebook bestseller chart of one country (ADR 0039). Throws
 * {@link ProviderError} when Apple can't be reached or answers something we
 * can't read; entries without a title are dropped.
 */
export async function fetchAppleChart(
  http: HttpOptions,
  region: ChartRegion,
): Promise<AppleEntry[]> {
  const parsed = Feed.safeParse(await requestJson(http, appleFeedUrl(region)));
  if (!parsed.success) throw new ProviderError('Apple Books chart has an unknown shape');
  return parsed.data.feed.results.flatMap((raw) => {
    const r = Result.safeParse(raw);
    if (!r.success) return [];
    return [
      {
        title: r.data.name,
        authors: splitAuthors(r.data.artistName),
        genreIds: (r.data.genres ?? []).flatMap((g) => (g ? [g.genreId] : [])),
      },
    ];
  });
}
