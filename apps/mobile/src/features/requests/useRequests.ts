import {
  settledStatuses,
  type AddRequest,
  type BookRequest,
  type ManualSearch,
  type RequestList,
  type WrongBookNext,
} from '@purrshelf/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/session/session';
import { rememberRequest } from './motion';
import { applyRequest, refreshLibraryOnDelivery, useLiveRequests } from './useRequestEvents';

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
  const client = useQueryClient();
  return useQuery({
    queryKey: ['requests'],
    queryFn: async () => {
      const before = client.getQueryData<RequestList>(['requests'])?.requests ?? [];
      const list = await call('requests');
      refreshLibraryOnDelivery(client, before, list.requests);
      return list;
    },
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

/** "What we tried" for a request (BRK-18). Free: reads the broker's records only. */
export function useRequestSearches(requestId: string) {
  const call = useSession((s) => s.call);
  return useQuery({
    queryKey: ['request', requestId, 'searches'],
    queryFn: () => call('requestSearches', { id: requestId }),
  });
}

/** Every indexer with its searches left today (the budget pill shows only the scarcest). */
export function useIndexerBudgets() {
  const call = useSession((s) => s.call);
  return useQuery({ queryKey: ['budget'], queryFn: () => call('budget'), staleTime: 60_000 });
}

/** "Sniff with these words": one paid search with the reader's own words (APP-18). */
export function useManualSearch() {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualSearch & { id: string }) => call('searchRequest', input),
    onSuccess: async ({ request }) => {
      applyRequest(client, request);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['request', request.id] }),
        client.invalidateQueries({ queryKey: ['budget'] }),
      ]);
    },
    onError: () => client.invalidateQueries({ queryKey: ['budget'] }),
  });
}

/** "Wrong book?" (APP-19): the book goes, and the request goes on as chosen. */
export function useWrongBook() {
  const call = useSession((s) => s.call);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; then: WrongBookNext }) => call('wrongBook', input),
    onSuccess: async (request) => {
      applyRequest(client, request);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['request', request.id] }),
        client.invalidateQueries({ queryKey: ['budget'] }),
        client.invalidateQueries({ queryKey: ['library'] }),
        client.invalidateQueries({ queryKey: ['work', request.workId] }),
      ]);
    },
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
    onSuccess: async (request, input) => {
      rememberRequest(request);
      // A book the library already had is delivered at once: the book's page
      // and the library must show it, or Add looks like it did nothing (APP-20).
      await Promise.all([
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['budget'] }),
        client.invalidateQueries({ queryKey: ['work', input.workId] }),
        client.invalidateQueries({ queryKey: ['library'] }),
      ]);
    },
  });
}
