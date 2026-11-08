import { VERSION } from '../../version.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Raised for any provider failure: network, timeout, HTTP error or a reply we can't read. */
export class ProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

/** Identifies the broker to metadata APIs without naming anyone. */
export const USER_AGENT = `Purrshelf/${VERSION} (self-hosted book app)`;

export interface HttpOptions {
  fetch: FetchLike;
  timeoutMs: number;
}

/**
 * GET or POST JSON. Returns `undefined` for a 404 so providers can say "no such
 * work"; every other failure throws {@link ProviderError}.
 */
export async function requestJson(
  http: HttpOptions,
  url: string,
  init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': USER_AGENT,
    ...init.headers,
  };
  const request: RequestInit = {
    method: init.method ?? 'GET',
    headers,
    signal: AbortSignal.timeout(http.timeoutMs),
  };
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    request.body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await http.fetch(url, request);
  } catch (cause) {
    throw new ProviderError(`request to ${new URL(url).host} failed`, { cause });
  }
  if (res.status === 404) return undefined;
  if (!res.ok) throw new ProviderError(`${new URL(url).host} answered ${res.status}`);
  try {
    return await res.json();
  } catch (cause) {
    throw new ProviderError(`${new URL(url).host} sent a reply that is not JSON`, { cause });
  }
}
