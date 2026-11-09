import type { DismissKind, Recommendation, Recommendations } from '@purrshelf/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/session';

export const recommendationsKey = ['recommendations'] as const;
const KEY = recommendationsKey;

/**
 * For you (BRK-11): free, built from the library and metadata only. The
 * broker caches the expensive part for a day, so asking again is cheap.
 */
export function useRecommendations() {
  const call = useSession((s) => s.call);
  return useQuery({
    queryKey: KEY,
    queryFn: () => call('recommendations'),
    staleTime: 5 * 60_000,
  });
}

/** Removes a book from every row in the cached answer, so the card leaves at once. */
function without(data: Recommendations | undefined, workId: string): Recommendations | undefined {
  if (!data) return data;
  return {
    ...data,
    rows: data.rows
      .map((row) => ({ ...row, items: row.items.filter((i) => i.work.id !== workId) }))
      .filter((row) => row.items.length > 0),
  };
}

/** Not for me / Fewer by this author, and Undo. */
export function useDismiss() {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  const dismiss = useMutation({
    mutationFn: ({ workId, kind }: { workId: string; kind: DismissKind }) =>
      call('dismissRecommendation', { workId, kind }),
    onMutate: async ({ workId, kind }) => {
      await client.cancelQueries({ queryKey: KEY });
      const before = client.getQueryData<Recommendations>(KEY);
      if (kind === 'book') client.setQueryData(KEY, without(before, workId));
      return { before };
    },
    onError: (_err, _vars, context) => client.setQueryData(KEY, context?.before),
    // Fewer by this author reshuffles the rows: ask the broker for the new order.
    onSuccess: (_data, { kind }) =>
      kind === 'author' ? client.invalidateQueries({ queryKey: KEY }) : undefined,
  });
  const undo = useMutation({
    mutationFn: (workId: string) => call('undoDismissRecommendation', { workId }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
  return { dismiss, undo };
}

/**
 * The For you suggestion for one book, from the answer already loaded on the
 * Search tab. The book page (APP-13) uses it for the ginger reason banner when
 * it was opened with `from=for-you`; null when the book is no longer suggested.
 */
export function useRecommendationFor(workId: string): Recommendation | null {
  const { data } = useQuery<Recommendations>({ queryKey: KEY, enabled: false });
  for (const row of data?.rows ?? []) {
    const found = row.items.find((i) => i.work.id === workId);
    if (found) return found;
  }
  return null;
}
