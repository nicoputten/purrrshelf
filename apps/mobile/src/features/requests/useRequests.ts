import { settledStatuses, type AddRequest, type BookRequest } from '@purrshelf/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/session';
import { applyRequest, useLiveRequests } from './useRequestEvents';

/** How often the Requests screen asks for news while a request is on its way. */
export const REQUEST_POLL_MS = 3000;

export const isSettled = (r: Pick<BookRequest, 'status'>) => settledStatuses.includes(r.status);

/**
 * My requests. Live over server-sent events; while the stream is down they
 * are refreshed every few seconds until each one has settled.
 */
export function useRequests() {
  const call = useSession((s) => s.call);
  const live = useLiveRequests((s) => s.live);
  return useQuery({
    queryKey: ['requests'],
    queryFn: () => call('requests'),
    refetchInterval: (query) =>
      !live && query.state.data?.requests.every(isSettled) === false ? REQUEST_POLL_MS : false,
  });
}

/** The releases the search found, for "Pick another". Free: the broker searches nothing. */
export function useReleases(requestId: string) {
  const call = useSession((s) => s.call);
  return useQuery({
    queryKey: ['request', requestId, 'releases'],
    queryFn: () => call('requestReleases', { id: requestId }),
  });
}

function useRequestAction<I>(action: (input: I) => Promise<BookRequest>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (request) => {
      applyRequest(client, request);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['request', request.id, 'releases'] }),
        client.invalidateQueries({ queryKey: ['budget'] }),
      ]);
    },
  });
}

export function usePickRelease() {
  const call = useSession((s) => s.call);
  return useRequestAction((input: { id: string; releaseId: string }) => call('pickRelease', input));
}

export function useRetryRequest() {
  const call = useSession((s) => s.call);
  return useRequestAction((id: string) => call('retryRequest', { id }));
}

export function useCancelRequest() {
  const call = useSession((s) => s.call);
  return useRequestAction((id: string) => call('cancelRequest', { id }));
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
