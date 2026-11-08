import type { FetchLike } from '@purrshelf/contract';

type Handler = (
  body: unknown,
  headers: Record<string, string>,
) => { status: number; body: unknown } | Error;

/** A tiny in-memory broker for app tests: route "METHOD /path" → handler. */
export function fakeBroker(routes: Record<string, Handler>) {
  const calls: { route: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const path = new URL(url).pathname.replace(/^\/api\/v1/, '');
    const route = `${init.method ?? 'GET'} ${path}`;
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body: unknown = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ route, body, headers });
    const handler = routes[route];
    if (!handler) return json(404, { code: 'NOT_FOUND', message: 'Not found' });
    const result = handler(body, headers);
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
