import { settledStatuses, type AddRequest, type BookRequest } from '@purrshelf/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/session';

/** How often the Requests screen asks for news while a request is on its way. */
export const REQUEST_POLL_MS = 3000;

export const isSettled = (r: Pick<BookRequest, 'status'>) => settledStatuses.includes(r.status);

/** My requests; refreshed every few seconds until each one has settled. */
export function useRequests() {
  const call = useSession((s) => s.call);
  return useQuery({
    queryKey: ['requests'],
    queryFn: () => call('requests'),
    refetchInterval: (query) =>
      query.state.data?.requests.every(isSettled) === false ? REQUEST_POLL_MS : false,
  });
}

export function useReaders() {
  const call = useSession((s) => s.call);
  return useQuery({ queryKey: ['readers'], queryFn: () => call('readers'), staleTime: 5 * 60_000 });
}

/** Tapping "Fetch it now": the broker searches (or just records ownership). */
export function useAddRequest() {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AddRequest) => call('addRequest', input),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['budget'] }),
      ]);
    },
  });
}
