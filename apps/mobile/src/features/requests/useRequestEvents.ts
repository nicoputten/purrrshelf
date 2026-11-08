import { API_PREFIX, BookRequest, requestEventsPath, type RequestList } from '@purrshelf/contract';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useSession } from '@/session/session';
import { libraryBooksKey } from '@/features/library/useLibrary';

export interface ServerEvent {
  event: string;
  data: string;
}

/** Splits a server-sent-events buffer into whole events and the unfinished rest. */
export function parseEvents(buffer: string): { events: ServerEvent[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: ServerEvent[] = [];
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

const delivered: readonly BookRequest['status'][] = ['in_library', 'pushed'];

/**
 * Reloads the library when a request has just reached it, so the new book
 * shows on the Library tab without restarting the app.
 */
export function refreshLibraryOnDelivery(
  client: QueryClient,
  before: readonly Pick<BookRequest, 'id' | 'status'>[],
  after: readonly Pick<BookRequest, 'id' | 'status'>[],
): void {
  const was = new Map(before.map((r) => [r.id, r.status]));
  const arrived = after.some((r) => {
    const old = was.get(r.id);
    return old !== undefined && !delivered.includes(old) && delivered.includes(r.status);
  });
  if (arrived) void client.invalidateQueries({ queryKey: libraryBooksKey });
}

/** Puts a changed request into the cached list (newest first) and its own entry. */
export function applyRequest(client: QueryClient, request: BookRequest): void {
  const previous =
    client.getQueryData<RequestList>(['requests'])?.requests.find((r) => r.id === request.id) ??
    client.getQueryData<BookRequest>(['request', request.id]);
  refreshLibraryOnDelivery(client, previous ? [previous] : [], [request]);
  client.setQueryData<RequestList>(['requests'], (list) => {
    if (!list) return list;
    const others = list.requests.filter((r) => r.id !== request.id);
    const known = others.length !== list.requests.length;
    return {
      requests: known
        ? list.requests.map((r) => (r.id === request.id ? request : r))
        : [request, ...others],
    };
  });
  client.setQueryData(['request', request.id], request);
}

/** Opens the stream; answers the response so the reader can follow it. */
export type EventStream = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
}>;

let streamImpl: EventStream = (url, init) => expoFetch(url, init);
/** Test hook: swap the stream transport. */
export function setEventStream(stream: EventStream | undefined): void {
  streamImpl = stream ?? ((url, init) => expoFetch(url, init));
}

/** Waits before reconnecting: 1 s, 2 s, 5 s, then every 15 s. */
export const RECONNECT_MS = [1000, 2000, 5000, 15_000];

/** Whether the live stream is up; Requests falls back to polling while it is not. */
export const useLiveRequests = create<{ live: boolean }>(() => ({ live: false }));

/** Follows my requests live over server-sent events while mounted (ADR 0012, 0024). */
export function useRequestEvents(): void {
  const client = useQueryClient();
  const serverUrl = useSession((s) => s.serverUrl);
  const token = useSession((s) => s.accessToken);
  const call = useSession((s) => s.call);

  useEffect(() => {
    if (!serverUrl || !token) return;
    const abort = new AbortController();
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const retry = () => {
      useLiveRequests.setState({ live: false });
      if (abort.signal.aborted) return;
      const wait = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)];
      attempt += 1;
      timer = setTimeout(() => void connect(), wait);
    };

    const connect = async () => {
      try {
        const res = await streamImpl(`${serverUrl}${API_PREFIX}${requestEventsPath}`, {
          headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
          signal: abort.signal,
        });
        if (res.status === 401) {
          // Refreshes the access token; the new token restarts this effect.
          await call('requests').catch(() => undefined);
          return;
        }
        if (!res.ok || !res.body) return retry();
        attempt = 0;
        useLiveRequests.setState({ live: true });
        // Catch up on anything that changed while we were not connected.
        void client.invalidateQueries({ queryKey: ['requests'] });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseEvents(buffer + decoder.decode(value, { stream: true }));
          buffer = parsed.rest;
          for (const e of parsed.events) {
            if (e.event !== 'request') continue;
            const request = BookRequest.safeParse(JSON.parse(e.data));
            if (request.success) applyRequest(client, request.data);
          }
        }
        retry();
      } catch {
        retry();
      }
    };

    void connect();
    return () => {
      abort.abort();
      clearTimeout(timer);
      useLiveRequests.setState({ live: false });
    };
  }, [serverUrl, token, client, call]);
}
