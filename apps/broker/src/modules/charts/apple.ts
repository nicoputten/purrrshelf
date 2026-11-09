import type { ChartRegion } from '@purrshelf/contract';
import { z } from 'zod';
import { ProviderError, requestJson, type HttpOptions } from '../discover/http.js';

/** Apple's marketing feeds: public, no key. */
export const APPLE_FEED_HOST = 'rss.marketingtools.apple.com';
/**
 * Apple's feed gateway is flaky from a home server: any request can get a
 * quick answer, a 502, or hang for 30 seconds and then 504 (seen 2026-11-09,
 * with and without a browser agent). An answer takes about a second, so
 * each try gets {@link APPLE_TRY_MS} and there are {@link APPLE_ATTEMPTS}.
 */
export const APPLE_ATTEMPTS = 6;
export const APPLE_TRY_MS = 6000;
const APPLE_HEADERS = { accept: '*/*', 'user-agent': 'Mozilla/5.0' };
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
 * The Apple Books ebook bestseller chart of one country (ADR 0039). Tries up
 * to {@link APPLE_ATTEMPTS} times, then throws {@link ProviderError}; also
 * throws it straight away for a reply we can't read. Entries without a title
 * are dropped.
 */
export async function fetchAppleChart(
  http: HttpOptions,
  region: ChartRegion,
): Promise<AppleEntry[]> {
  let body: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      body = await requestJson(http, appleFeedUrl(region), { headers: APPLE_HEADERS });
      break;
    } catch (err) {
      // A 5xx, a timeout or a dropped connection: Apple often answers the next try.
      if (!(err instanceof ProviderError) || attempt >= APPLE_ATTEMPTS) throw err;
    }
  }
  const parsed = Feed.safeParse(body);
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
