import type { z } from 'zod';
import { ErrorResponse, type ErrorCode } from './errors.js';
import { API_PREFIX, endpoints, type Endpoint, type Endpoints } from './endpoints.js';

type InputPart<E, K extends string> = E extends { [P in K]: z.ZodType } ? z.input<E[K]> : object;
/**
 * What `call` takes besides the endpoint name: one object holding the JSON
 * body fields and the path and query parameters (each part keeps its own keys).
 */
type InputOf<E> = E extends { body: z.ZodType }
  ? z.input<E['body']> & InputPart<E, 'params'>
  : E extends { params: z.ZodType } | { query: z.ZodType }
    ? InputPart<E, 'params'> & InputPart<E, 'query'>
    : undefined;
type ResponseOf<E> = E extends { response: z.ZodType } ? z.output<E['response']> : never;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Network failure or a reply that is not a Purrshelf broker reply. */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  /** Returns the current access token, if any. */
  getAccessToken?: () => string | undefined;
}

export type CallArgs<N extends keyof Endpoints> =
  InputOf<Endpoints[N]> extends undefined ? [] : [input: InputOf<Endpoints[N]>];

/** Fills `:name` path segments and appends the query string. */
export function buildPath(ep: Endpoint, input: unknown): string {
  let path = ep.path;
  if (ep.params) {
    const params = ep.params.parse(input) as Record<string, unknown>;
    path = path.replace(/:(\w+)/g, (_m, name: string) => encodeURIComponent(String(params[name])));
  }
  if (ep.query) {
    const query = ep.query.parse(input) as Record<string, unknown>;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const qs = search.toString();
    if (qs) path += `?${qs}`;
  }
  return path;
}

export interface ApiClient {
  call<N extends keyof Endpoints>(name: N, ...args: CallArgs<N>): Promise<ResponseOf<Endpoints[N]>>;
}

/** Normalises a user-entered server address: trims, drops trailing slashes, requires http(s). */
export function normaliseBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new TypeError('Invalid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new TypeError('Invalid URL');
  return trimmed;
}

export function createClient(options: ClientOptions): ApiClient {
  const baseUrl = normaliseBaseUrl(options.baseUrl);
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  return {
    async call(name, ...args) {
      const ep: Endpoint = endpoints[name];
      const headers: Record<string, string> = { accept: 'application/json' };
      const init: RequestInit = { method: ep.method, headers };
      const [input] = args as unknown[];
      if (ep.body) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(ep.body.parse(input));
      }
      const path = buildPath(ep, input);
      const token = ep.auth ? options.getAccessToken?.() : undefined;
      if (token) headers.authorization = `Bearer ${token}`;

      let res: Response;
      try {
        res = await doFetch(`${baseUrl}${API_PREFIX}${path}`, init);
      } catch (cause) {
        throw new NetworkError('Server not reachable', { cause });
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (cause) {
        throw new NetworkError('Not a Purrshelf server', { cause });
      }

      if (!res.ok) {
        const parsed = ErrorResponse.safeParse(json);
        if (!parsed.success) throw new NetworkError('Not a Purrshelf server');
        throw new ApiError(res.status, parsed.data.code, parsed.data.message, parsed.data.details);
      }
      const parsed = ep.response.safeParse(json);
      if (!parsed.success)
        throw new NetworkError('Not a Purrshelf server', { cause: parsed.error });
      return parsed.data as never;
    },
  };
}
