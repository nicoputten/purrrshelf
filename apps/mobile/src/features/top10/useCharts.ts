import {
  chartGenres,
  type BookRequest,
  type Chart,
  type ChartEntry,
  type ChartGenre,
  type ChartRegion,
  type Charts,
  type RequestList,
  type RequestStatus,
} from '@purrshelf/contract';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useSession } from '@/session/session';

export const chartsKey = ['charts'] as const;

/**
 * Top 10s (BRK-12): free, built from Apple Books, Hardcover and metadata only.
 * The broker fetches a chart at most once a day, so an hour here is plenty.
 */
export function useCharts() {
  const call = useSession((s) => s.call);
  return useQuery({
    queryKey: chartsKey,
    queryFn: () => call('charts'),
    staleTime: 60 * 60_000,
  });
}

/** The genres with a chip, in chip order. `all` is the whole chart: no chip. */
export type ChipGenre = Exclude<ChartGenre, 'all'>;
export const chipGenres = chartGenres.filter((g): g is ChipGenre => g !== 'all');
export const DEFAULT_GENRE: ChipGenre = 'thriller';

export function isChipGenre(value: unknown): value is ChipGenre {
  return typeof value === 'string' && (chipGenres as readonly string[]).includes(value);
}

export type Source = 'apple' | 'hardcover';

/** The reader's own chart region: the broker puts it first. */
export function homeRegion(data: Charts | undefined): ChartRegion | null {
  return data?.charts.find((c) => c.source === 'apple')?.region ?? null;
}

/** The other Apple chart region in the answer, for "Switch to …". */
export function otherRegion(data: Charts | undefined, region: ChartRegion): ChartRegion | null {
  const found = data?.charts.find(
    (c) => c.source === 'apple' && c.region !== null && c.region !== region,
  );
  return found?.region ?? null;
}

export function hasTrending(data: Charts | undefined): boolean {
  return data?.charts.some((c) => c.source === 'hardcover') ?? false;
}

/** One genre list, or null when the genre has no books today. */
export function findChart(
  data: Charts | undefined,
  source: Source,
  region: ChartRegion | null,
  genre: ChartGenre,
): Chart | null {
  return (
    data?.charts.find(
      (c) =>
        c.source === source && c.genre === genre && (source === 'hardcover' || c.region === region),
    ) ?? null
  );
}

export type EntryChip =
  | { kind: 'library'; label: string }
  | { kind: 'instant'; label: string }
  | { kind: 'request'; label: string };

/** Statuses that say nothing new once the book is in a library. */
type QuietStatus = 'in_library' | 'pushed' | 'cancelled';
const isLoud = (s: RequestStatus): s is Exclude<RequestStatus, QuietStatus> =>
  s !== 'in_library' && s !== 'pushed' && s !== 'cancelled';

/**
 * At most one chip per row (board 13): my library wins, then my request
 * (with progress when the requests list is loaded), then a partner's copy.
 */
export function entryChip(
  entry: ChartEntry,
  requests: readonly BookRequest[] | undefined,
  t: TFunction,
): EntryChip | null {
  const owners = entry.work?.library?.owners ?? [];
  if (owners.some((o) => o.me)) return { kind: 'library', label: t('top10.inLibrary') };
  const status = entry.request?.status;
  if (entry.request && status && isLoud(status)) {
    if (status === 'downloading') {
      const full = requests?.find((r) => r.id === entry.request?.id);
      return {
        kind: 'request',
        label:
          full?.progress != null
            ? t('top10.downloading', { progress: full.progress })
            : t('forYou.request.downloading'),
      };
    }
    return { kind: 'request', label: t(`forYou.request.${status}`) };
  }
  const partner = owners.find((o) => !o.me);
  if (partner) return { kind: 'instant', label: t('top10.instant', { name: partner.displayName }) };
  return null;
}

/** My requests as already loaded elsewhere (the pill, Requests); never fetched from here. */
export function useCachedRequests(): readonly BookRequest[] | undefined {
  const { data } = useQuery<RequestList>({ queryKey: ['requests'], queryFn: skipToken });
  return data?.requests;
}

/** "<author> <title>": what "Search for it" types into Search. */
export function searchQueryFor(entry: Pick<ChartEntry, 'title' | 'authors'>): string {
  return [entry.authors[0], entry.title].filter(Boolean).join(' ');
}

/** "9 Nov, 06:00" in the reader's language. */
export function formatUpdated(iso: string, language: string): string {
  return new Date(iso).toLocaleString(language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
