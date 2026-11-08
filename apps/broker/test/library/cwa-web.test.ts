import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CwaKoboApi,
  CwaWebSession,
  extractCsrfToken,
  type Fetch,
} from '../../src/modules/library/cwa-web.js';
import { BASE_URL, FakeCwa, SERVICE } from './fake-cwa.js';

let cwa: FakeCwa;
let session: CwaWebSession;

beforeEach(() => {
  cwa = new FakeCwa();
  session = new CwaWebSession({ baseUrl: BASE_URL, ...SERVICE, fetch: cwa.fetch });
});
afterEach(() => cwa.close());

const logins = () => cwa.calls.filter((c) => c.path === '/login' && c.method === 'POST');

describe('extractCsrfToken', () => {
  it('reads the hidden csrf_token input', () => {
    expect(extractCsrfToken('<input type="hidden" name="csrf_token" value="abc.123">')).toBe(
      'abc.123',
    );
    expect(extractCsrfToken('<html></html>')).toBeNull();
  });
});

describe('CwaWebSession', () => {
  it('logs in with the login form’s CSRF token and keeps the cookie', async () => {
    expect(session.loggedIn).toBe(false);
    await session.login();
    expect(session.loggedIn).toBe(true);
    const post = logins()[0]!;
    expect(Object.fromEntries(new URLSearchParams(post.body))).toEqual({
      csrf_token: 'fake-login-csrf',
      username: SERVICE.username,
      password: SERVICE.password,
      remember_me: 'on',
      next: '/',
    });
    const res = await session.get('/');
    expect(res.status).toBe(200);
    expect(cwa.calls.at(-1)!.headers.get('cookie')).toBe('session=s1');
  });

  it('logs in only once for concurrent callers', async () => {
    await Promise.all([session.login(), session.login(), session.get('/')]);
    expect(logins()).toHaveLength(1);
  });

  it('logs in again after CWA forgets the session', async () => {
    await session.get('/');
    cwa.expireSessions();
    expect((await session.get('/')).status).toBe(200);
    expect(logins()).toHaveLength(2);
  });

  it('gives up when CWA keeps sending it to the login page', async () => {
    await session.login();
    cwa.behaviour.override = (call) =>
      call.path === '/x' ? new Response(null, { status: 401 }) : undefined;
    await expect(session.post('/x')).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      message: 'CWA keeps asking the broker to log in',
    });
    expect(logins()).toHaveLength(2);
  });

  it('rejects a wrong password', async () => {
    const wrong = new CwaWebSession({
      baseUrl: BASE_URL,
      username: SERVICE.username,
      password: 'x',
      fetch: cwa.fetch,
    });
    await expect(wrong.login()).rejects.toMatchObject({
      message: 'CWA rejected the service account login',
      details: { status: 200 },
    });
    expect(wrong.loggedIn).toBe(false);
  });

  it('treats a redirect back to the login page as a failed login', async () => {
    cwa.behaviour.override = (call) =>
      call.path === '/login' && call.method === 'POST'
        ? new Response(null, {
            status: 302,
            headers: { location: 'http://cwa.example.invalid/login/' },
          })
        : undefined;
    await expect(session.login()).rejects.toMatchObject({
      message: 'CWA rejected the service account login',
    });
  });

  it('reports a login rate limit', async () => {
    cwa.behaviour.override = (call) =>
      call.path === '/login' && call.method === 'POST'
        ? new Response(null, { status: 429 })
        : undefined;
    await expect(session.login()).rejects.toMatchObject({
      message: 'CWA is rate-limiting the broker login',
    });
  });

  it('reports a login page without CSRF token', async () => {
    cwa.behaviour.override = (call) =>
      call.path === '/login' ? new Response('<html>') : undefined;
    await expect(session.login()).rejects.toMatchObject({
      message: 'CWA login page has no CSRF token',
    });
    cwa.behaviour.override = (call) =>
      call.path === '/login' ? new Response('down', { status: 503 }) : undefined;
    await expect(session.login()).rejects.toMatchObject({ details: { status: 503 } });
  });

  it('reports a session CWA does not keep after login', async () => {
    cwa.behaviour.override = (call) =>
      call.path === '/'
        ? new Response(null, { status: 302, headers: { location: '/login' } })
        : undefined;
    await expect(session.login()).rejects.toMatchObject({
      message: 'CWA did not keep the service account session',
    });
    cwa.behaviour.override = (call) => (call.path === '/' ? new Response('<html>') : undefined);
    await expect(session.login()).rejects.toMatchObject({
      message: 'CWA did not keep the service account session',
    });
  });

  it('ignores redirects elsewhere and malformed cookies', async () => {
    await session.login();
    cwa.behaviour.override = (call) =>
      call.path === '/elsewhere'
        ? new Response(null, {
            status: 302,
            headers: [
              ['location', '/shelf/1'],
              ['set-cookie', 'garbage'],
              ['set-cookie', 'other=1; Path=/'],
            ],
          })
        : call.path === '/nowhere'
          ? new Response(null, { status: 302 })
          : undefined;
    expect((await session.get('/elsewhere')).status).toBe(302);
    expect((await session.get('/nowhere')).status).toBe(302);
    await session.get('/');
    expect(cwa.calls.at(-1)!.headers.get('cookie')).toBe('session=s1; other=1');
  });

  it('reports CWA being unreachable', async () => {
    const down: Fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const s = new CwaWebSession({ baseUrl: BASE_URL, ...SERVICE, fetch: down, timeoutMs: 10 });
    await expect(s.login()).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      message: 'Cannot reach CWA',
      details: { path: '/login', cause: 'connect ECONNREFUSED' },
    });
  });

  it('uses the global fetch by default', () => {
    expect(new CwaWebSession({ baseUrl: BASE_URL, ...SERVICE }).loggedIn).toBe(false);
  });
});

describe('CwaKoboApi', () => {
  it('posts tag items as the token’s owner', async () => {
    const api = new CwaKoboApi({ baseUrl: `${BASE_URL}///`, fetch: cwa.fetch });
    cwa.addBook({ id: 1, title: 'A' });
    await api.addToShelf('kobo-token-a', 'shelf-kobo-a', ['00000000-0000-4000-8000-000000000001']);
    await api.removeFromShelf('kobo-token-a', 'shelf-kobo-a', [
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(cwa.calls.map((c) => c.path)).toEqual([
      '/kobo/kobo-token-a/v1/library/tags/shelf-kobo-a/items',
      '/kobo/kobo-token-a/v1/library/tags/shelf-kobo-a/items/delete',
    ]);
  });

  it('reports refusals and network errors without the token', async () => {
    const api = new CwaKoboApi({ baseUrl: BASE_URL, fetch: cwa.fetch });
    const refused = await api.addToShelf('bad-token', 'shelf', ['u']).catch((e: unknown) => e);
    expect(refused).toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
      details: { path: '/v1/library/tags/shelf/items', status: 401 },
    });
    const down = new CwaKoboApi({
      baseUrl: BASE_URL,
      fetch: () => Promise.reject(new Error('reset')),
    });
    await expect(down.removeFromShelf('secret', 'shelf', ['u'])).rejects.toMatchObject({
      message: 'Cannot reach CWA',
      details: { path: '/v1/library/tags/shelf/items/delete', cause: 'reset' },
    });
    expect(new CwaKoboApi({ baseUrl: BASE_URL })).toBeInstanceOf(CwaKoboApi);
  });
});
