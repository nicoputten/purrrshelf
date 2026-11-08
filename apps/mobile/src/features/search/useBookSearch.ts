import type { SearchLanguage } from '@purrshelf/contract';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '@/session/session';

/** Searching starts this long after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 450;
export const MIN_QUERY_LENGTH = 2;

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Metadata search: free, cached by the broker, never spends an indexer search. */
export function useBookSearch(text: string, language: SearchLanguage) {
  const call = useSession((s) => s.call);
  const q = text.trim();
  return useQuery({
    queryKey: ['discover', q.toLowerCase(), language],
    queryFn: () => call('discoverSearch', { q, language }),
    enabled: q.length >= MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

/** Searches left today, for the budget pill; `null` while unknown or without indexers. */
export function useSearchBudget() {
  const call = useSession((s) => s.call);
  const query = useQuery({
    queryKey: ['budget'],
    queryFn: () => call('budget'),
    staleTime: 60_000,
  });
  const searches = query.data?.searches;
  return searches && searches.limit > 0 ? { left: searches.left, limit: searches.limit } : null;
}
