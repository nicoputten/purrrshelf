import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  createClient,
  normaliseBaseUrl,
  type FetchLike,
} from '../src/index.js';

const tokens = {
  accessToken: 'a.b.c',
  accessTokenExpiresIn: 900,
  refreshToken: 'r',
  refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('normaliseBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normaliseBaseUrl('  https://books.example.invalid/ ')).toBe(
      'https://books.example.invalid',
    );
    expect(normaliseBaseUrl('http://10.0.0.1:8080//')).toBe('http://10.0.0.1:8080');
  });

  it.each(['', 'not a url', 'ftp://example.invalid', 'books.example.invalid'])(
    'rejects %j',
    (input) => {
      expect(() => normaliseBaseUrl(input)).toThrow(TypeError);
    },
  );
});

describe('createClient', () => {
  it('posts the validated body and parses the response', async () => {
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, tokens));
    const client = createClient({ baseUrl: 'https://x.example.invalid/', fetch });

    await expect(client.call('login', { username: ' reader ', password: 'pw' })).resolves.toEqual(
      tokens,
    );

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://x.example.invalid/api/v1/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ username: 'reader', password: 'pw' });
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('sends the bearer token on authenticated endpoints only', async () => {
    const me = {
      id: '1',
      username: 'reader',
      displayName: 'Reader',
      locale: 'en',
      kobo: { configured: false },
    };
    const fetch = vi.fn<FetchLike>(async () => jsonResponse(200, me));
    const client = createClient({
      baseUrl: 'https://x.example.invalid',
      fetch,
      getAccessToken: () => 'tok',
    });

    await client.call('me');
    expect((fetch.mock.calls[0]![1].headers as Record<string, string>).authorization).toBe(
      'Bearer tok',
    );
    expect(fetch.mock.calls[0]![1].body).toBeUndefined();
  });

  it('turns an error body into an ApiError with its code', async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'Wrong username or password' }),
    );
    const client = createClient({ baseUrl: 'https://x.example.invalid', fetch });
    const err = await client
      .call('login', { username: 'a', password: 'b' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('throws NetworkError when the server cannot be reached', async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError('fetch failed');
    });
    const client = createClient({ baseUrl: 'https://x.example.invalid', fetch });
    await expect(client.call('health')).rejects.toBeInstanceOf(NetworkError);
  });

  it.each([
    ['a non-JSON reply', new Response('<html>', { status: 200 })],
    ['JSON of the wrong shape', jsonResponse(200, { hello: 'world' })],
    ['an error of the wrong shape', jsonResponse(500, { error: 'boom' })],
  ])('throws NetworkError on %s', async (_label, response) => {
    const client = createClient({
      baseUrl: 'https://x.example.invalid',
      fetch: async () => response,
    });
    await expect(client.call('health')).rejects.toThrow('Not a Purrshelf server');
  });

  it('rejects an invalid body before sending anything', async () => {
    const fetch = vi.fn<FetchLike>();
    const client = createClient({ baseUrl: 'https://x.example.invalid', fetch });
    await expect(client.call('login', { username: '', password: 'x' })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the global fetch by default', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse(200, { service: 'purrshelf-broker', status: 'ok', version: '1', checks: [] }),
      );
    await createClient({ baseUrl: 'https://x.example.invalid' }).call('health');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
