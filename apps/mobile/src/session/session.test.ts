import { ApiError, NetworkError } from '@purrshelf/contract';
import { StorageKeys } from '@/lib/storage';
import { apiError, fakeBroker, health, me, tokens } from '@/test/fakeBroker';
import { resetApp, secureStore } from '@/test/utils';
import { setFetch, useSession } from './session';

const URL = 'https://shelf.example.invalid';
beforeEach(resetApp);

const state = () => useSession.getState();

describe('bootstrap', () => {
  it('asks for a server on first launch', async () => {
    await state().bootstrap();
    expect(state().status).toBe('needsServer');
  });

  it('asks for a login when a server is known but there is no session', async () => {
    secureStore.set(StorageKeys.serverUrl, URL);
    await state().bootstrap();
    expect(state()).toMatchObject({ status: 'needsLogin', serverUrl: URL });
  });

  it('restores the session with the stored refresh token', async () => {
    secureStore.set(StorageKeys.serverUrl, URL);
    secureStore.set(StorageKeys.refreshToken, 'refresh-0');
    const broker = fakeBroker({ 'POST /auth/refresh': () => tokens(1) });
    setFetch(broker.fetch);
    await state().bootstrap();
    expect(state()).toMatchObject({ status: 'ready', accessToken: 'access-1' });
    expect(broker.calls[0]!.body).toEqual({ refreshToken: 'refresh-0' });
    expect(secureStore.get(StorageKeys.refreshToken)).toBe('refresh-1');
  });

  it('sends the user to login when the server rejects the refresh token', async () => {
    secureStore.set(StorageKeys.serverUrl, URL);
    secureStore.set(StorageKeys.refreshToken, 'old');
    setFetch(
      fakeBroker({ 'POST /auth/refresh': () => apiError(401, 'INVALID_REFRESH_TOKEN') }).fetch,
    );
    await state().bootstrap();
    expect(state().status).toBe('needsLogin');
    expect(secureStore.has(StorageKeys.refreshToken)).toBe(false);
  });

  it('keeps the session when the server is unreachable at start-up', async () => {
    secureStore.set(StorageKeys.serverUrl, URL);
    secureStore.set(StorageKeys.refreshToken, 'r');
    setFetch(fakeBroker({ 'POST /auth/refresh': () => new TypeError('offline') }).fetch);
    await state().bootstrap();
    expect(state().status).toBe('ready');
    expect(secureStore.get(StorageKeys.refreshToken)).toBe('r');
  });
});

describe('connect', () => {
  it('checks /health and stores the normalised URL', async () => {
    const broker = fakeBroker({ 'GET /health': health });
    setFetch(broker.fetch);
    await state().connect(`  ${URL}/ `);
    expect(state()).toMatchObject({ status: 'needsLogin', serverUrl: URL });
    expect(secureStore.get(StorageKeys.serverUrl)).toBe(URL);
  });

  it('rejects a server that is not a Purrshelf broker', async () => {
    setFetch(fakeBroker({ 'GET /health': () => ({ status: 200, body: { ok: true } }) }).fetch);
    await expect(state().connect(URL)).rejects.toBeInstanceOf(NetworkError);
    expect(secureStore.has(StorageKeys.serverUrl)).toBe(false);
  });

  it('rejects an invalid URL without calling anything', async () => {
    const broker = fakeBroker({});
    setFetch(broker.fetch);
    await expect(state().connect('not a url')).rejects.toThrow('Invalid URL');
    expect(broker.calls).toHaveLength(0);
  });
});

describe('login, calls and logout', () => {
  async function loggedIn(routes: Parameters<typeof fakeBroker>[0]) {
    const broker = fakeBroker({
      'GET /health': health,
      'POST /auth/login': () => tokens(1),
      ...routes,
    });
    setFetch(broker.fetch);
    await state().connect(URL);
    await state().login('reader', 'pw');
    return broker;
  }

  it('stores the refresh token in secure storage and keeps the access token in memory', async () => {
    await loggedIn({});
    expect(state()).toMatchObject({ status: 'ready', accessToken: 'access-1' });
    expect(secureStore.get(StorageKeys.refreshToken)).toBe('refresh-1');
    expect([...secureStore.values()]).not.toContain('access-1');
  });

  it('refuses to log in without a server', async () => {
    await expect(state().login('a', 'b')).rejects.toThrow('No server');
    await expect(state().call('me')).rejects.toThrow('No server');
  });

  it('sends the access token on calls', async () => {
    const broker = await loggedIn({ 'GET /me': me });
    await expect(state().call('me')).resolves.toMatchObject({ username: 'reader' });
    expect(broker.calls.at(-1)!.headers.authorization).toBe('Bearer access-1');
  });

  it('refreshes once on UNAUTHORIZED and retries the call', async () => {
    let meCalls = 0;
    const broker = await loggedIn({
      'GET /me': () => (++meCalls === 1 ? apiError(401, 'UNAUTHORIZED') : me()),
      'POST /auth/refresh': () => tokens(2),
    });
    await expect(state().call('me')).resolves.toMatchObject({ username: 'reader' });
    expect(broker.calls.at(-1)!.headers.authorization).toBe('Bearer access-2');
  });

  it('shares one refresh between concurrent calls', async () => {
    let refreshes = 0;
    let n = 0;
    await loggedIn({
      'GET /me': (_b, h) =>
        h.authorization === 'Bearer access-1' ? apiError(401, 'UNAUTHORIZED') : me(),
      'POST /auth/refresh': () => {
        refreshes++;
        return tokens(2 + n++);
      },
    });
    await Promise.all([state().call('me'), state().call('me')]);
    expect(refreshes).toBe(1);
  });

  it('logs out when the refresh fails too', async () => {
    await loggedIn({
      'GET /me': () => apiError(401, 'UNAUTHORIZED'),
      'POST /auth/refresh': () => apiError(401, 'INVALID_REFRESH_TOKEN'),
    });
    await expect(state().call('me')).rejects.toBeInstanceOf(ApiError);
    expect(state()).toMatchObject({ status: 'needsLogin', accessToken: null });
  });

  it('logs out locally even when the server is unreachable', async () => {
    const broker = await loggedIn({ 'POST /auth/logout': () => new TypeError('offline') });
    await state().logout();
    expect(broker.calls.at(-1)).toMatchObject({
      route: 'POST /auth/logout',
      body: { refreshToken: 'refresh-1' },
    });
    expect(state()).toMatchObject({ status: 'needsLogin', accessToken: null });
    expect(secureStore.has(StorageKeys.refreshToken)).toBe(false);
  });

  it('changeServer forgets the server and the session', async () => {
    await loggedIn({ 'POST /auth/logout': () => ({ status: 200, body: {} }) });
    await state().changeServer();
    expect(state()).toMatchObject({ status: 'needsServer', serverUrl: null });
    expect(secureStore.size).toBe(0);
  });

  it('passes other errors through', async () => {
    await loggedIn({ 'GET /me': () => apiError(500, 'INTERNAL_ERROR') });
    await expect(state().call('me')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(state().status).toBe('ready');
  });
});
