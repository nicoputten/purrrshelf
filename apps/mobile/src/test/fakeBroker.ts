import type { FetchLike } from '@purrshelf/contract';

type Handler = (
  body: unknown,
  headers: Record<string, string>,
  url: URL,
) => { status: number; body: unknown } | Error;

/** A tiny in-memory broker for app tests: route "METHOD /path" → handler. */
export function fakeBroker(routes: Record<string, Handler>) {
  const calls: { route: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname.replace(/^\/api\/v1/, ''));
    const route = `${init.method ?? 'GET'} ${path}`;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body: unknown = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ route, body, headers });
    const handler = routes[route];
    if (!handler) return json(404, { code: 'NOT_FOUND', message: 'Not found' });
    const result = handler(body, headers, parsed);
    if (result instanceof Error) throw result;
    return json(result.status, result.body);
  };
  return { fetch, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const health = () => ({
  status: 200,
  body: { service: 'purrshelf-broker', status: 'ok', version: '1', checks: [] },
});

export const tokens = (n = 1) => ({
  status: 200,
  body: {
    accessToken: `access-${n}`,
    accessTokenExpiresIn: 900,
    refreshToken: `refresh-${n}`,
    refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  },
});

export const me = () => ({
  status: 200,
  body: {
    id: 'u1',
    username: 'reader',
    displayName: 'Reader One',
    locale: 'en',
    kobo: { configured: false },
  },
});

export const apiError = (status: number, code: string, details?: unknown) => ({
  status,
  body: { code, message: code, ...(details ? { details } : {}) },
});

/** An invented search hit; override any field. */
export function hit(over: Record<string, unknown> = {}) {
  return {
    id: 'hardcover:301',
    mediaType: 'ebook',
    title: 'The Salt Road',
    subtitle: null,
    authors: ['Ilse Varenkamp'],
    language: 'en',
    series: { id: 'hardcover:77', name: 'Lantern Keepers', position: 1, total: 3 },
    publishedYear: 2019,
    isbns: ['9780000000026'],
    hasCover: true,
    sources: [{ provider: 'hardcover', id: '301' }],
    library: null,
    ...over,
  };
}

export const searchResult = (hits: unknown[]) => ({
  status: 200,
  body: {
    hits,
    providers: [
      { provider: 'hardcover', status: 'ok' },
      { provider: 'openlibrary', status: 'ok' },
      { provider: 'googlebooks', status: 'ok' },
    ],
  },
});

export const budget = (left = 21, limit = 25) => ({
  status: 200,
  body: {
    windowMinutes: 1440,
    searches: { limit, left, nextFreeAt: '2026-01-01T12:00:00.000Z' },
    indexers: [],
  },
});

/** Work detail for an invented book; override any field. */
export function work(over: Record<string, unknown> = {}) {
  return {
    ...hit(),
    description: 'A lamplighter walks the salt road to the sea.',
    subjects: ['Fantasy'],
    pageCount: 320,
    ...over,
  };
}

export const ok = (body: unknown) => ({ status: 200, body });

export const readers = (over: Record<string, unknown>[] = []) =>
  ok({
    readers: over.length
      ? over
      : [
          { id: 'u1', displayName: 'Reader One', me: true, kobo: true },
          { id: 'u2', displayName: 'Reader Two', me: false, kobo: true },
        ],
  });

/** Budget with one active indexer, so one add costs up to 4 searches. */
export const budgetWithIndexer = (left = 21, limit = 25) => {
  const counter = {
    limit,
    used: limit - left,
    left,
    nextFreeAt: '2026-01-01T12:00:00.000Z',
    limitReachedUntil: null,
  };
  return ok({
    windowMinutes: 1440,
    searches: { limit, left, nextFreeAt: '2026-01-01T12:00:00.000Z' },
    indexers: [
      { indexerId: 'primary', name: 'Primary', priority: 0, searches: counter, grabs: counter },
    ],
  });
};

/** An invented request; override any field. */
export function bookRequest(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    workId: 'hardcover:301',
    title: 'The Salt Road',
    authors: ['Ilse Varenkamp'],
    language: 'en',
    mediaType: 'ebook',
    status: 'searching',
    progress: null,
    error: null,
    pushTo: ['u1'],
    searches: 1,
    searchedOn: ['Primary'],
    release: null,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...over,
  };
}

/** An invented release option for the picker; override any field. */
export function releaseOption(over: Record<string, unknown> = {}) {
  return {
    id: 'rel-1',
    title: 'Ilse Varenkamp - The Salt Road (2019) EPUB',
    format: 'epub',
    size: 1_400_000,
    language: 'en',
    indexerName: 'Primary',
    publishedAt: '2025-12-29T12:00:00.000Z',
    grabs: 12,
    score: 92,
    rejected: [],
    picked: false,
    titleMatch: true,
    authorMatch: true,
    ...over,
  };
}

/** An invented For you suggestion (BRK-11); override any field. */
export function recommendation(over: Record<string, unknown> = {}) {
  return {
    work: hit({ id: 'hardcover:401', title: 'The Lamp Road', series: null }),
    reason: {
      kind: 'author',
      author: 'Ilse Varenkamp',
      basis: 'finished',
      count: 1,
      title: 'The Salt Road',
    },
    isNew: false,
    request: null,
    ...over,
  };
}

/** A For you answer; rows default to none (the getting-started state). */
export const recommendations = (rows: unknown[] = [], over: Record<string, unknown> = {}) =>
  ok({
    rows,
    readingData: true,
    computedAt: '2026-01-01T12:00:00.000Z',
    stale: false,
    ...over,
  });
