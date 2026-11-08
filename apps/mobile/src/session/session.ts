import {
  ApiError,
  createClient,
  normaliseBaseUrl,
  NetworkError,
  type ApiClient,
  type CallArgs,
  type Endpoints,
  type FetchLike,
  type Me,
  type TokenPair,
} from '@purrshelf/contract';
import type { z } from 'zod';
import { create } from 'zustand';
import { StorageKeys, storage } from '@/lib/storage';

export type SessionStatus = 'loading' | 'needsServer' | 'needsLogin' | 'ready';

type ResponseOf<N extends keyof Endpoints> = z.output<Endpoints[N]['response']>;

interface SessionState {
  status: SessionStatus;
  serverUrl: string | null;
  /** Kept in memory only; the refresh token lives in secure storage. */
  accessToken: string | null;
  /** Restores the session on app start. */
  bootstrap: () => Promise<void>;
  /** Checks that the URL is a Purrshelf broker and remembers it. */
  connect: (url: string) => Promise<void>;
  /** Forgets the server (and any session) so onboarding starts again. */
  changeServer: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Calls an endpoint with the access token, refreshing it once if it has expired. */
  call: <N extends keyof Endpoints>(name: N, ...args: CallArgs<N>) => Promise<ResponseOf<N>>;
}

let fetchImpl: FetchLike | undefined;
/** Test hook: swap the network layer. */
export function setFetch(fetch: FetchLike | undefined): void {
  fetchImpl = fetch;
}

function clientFor(baseUrl: string, getAccessToken?: () => string | undefined): ApiClient {
  return createClient({
    baseUrl,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    ...(getAccessToken ? { getAccessToken } : {}),
  });
}

let refreshing: Promise<boolean> | null = null;

export const useSession = create<SessionState>((set, get) => {
  async function storeTokens(tokens: TokenPair): Promise<void> {
    await storage.set(StorageKeys.refreshToken, tokens.refreshToken);
    set({ accessToken: tokens.accessToken, status: 'ready' });
  }

  async function dropSession(): Promise<void> {
    await storage.remove(StorageKeys.refreshToken);
    set({ accessToken: null, status: get().serverUrl ? 'needsLogin' : 'needsServer' });
  }

  /** Returns true if a new access token was obtained. Concurrent callers share one refresh. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const { serverUrl } = get();
      const refreshToken = await storage.get(StorageKeys.refreshToken);
      if (!serverUrl || !refreshToken) return false;
      try {
        await storeTokens(await clientFor(serverUrl).call('refresh', { refreshToken }));
        return true;
      } catch (err) {
        // Only a definite "no" from the server ends the session; being offline does not.
        if (err instanceof ApiError) await dropSession();
        else throw err;
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  return {
    status: 'loading',
    serverUrl: null,
    accessToken: null,

    bootstrap: async () => {
      const serverUrl = await storage.get(StorageKeys.serverUrl);
      if (!serverUrl) {
        set({ status: 'needsServer', serverUrl: null });
        return;
      }
      set({ serverUrl });
      const hasRefresh = await storage.get(StorageKeys.refreshToken);
      if (!hasRefresh) {
        set({ status: 'needsLogin' });
        return;
      }
      try {
        if (!(await refresh())) set({ status: 'needsLogin' });
      } catch {
        // Offline at start-up: keep the session; calls will refresh when the server is back.
        set({ status: 'ready' });
      }
    },

    connect: async (url) => {
      const serverUrl = normaliseBaseUrl(url);
      const health = await clientFor(serverUrl).call('health');
      if (health.service !== 'purrshelf-broker') throw new NetworkError('Not a Purrshelf server');
      await storage.set(StorageKeys.serverUrl, serverUrl);
      set({ serverUrl, status: 'needsLogin' });
    },

    changeServer: async () => {
      await get().logout();
      await storage.remove(StorageKeys.serverUrl);
      set({ serverUrl: null, status: 'needsServer' });
    },

    login: async (username, password) => {
      const { serverUrl } = get();
      if (!serverUrl) throw new Error('No server configured');
      await storeTokens(await clientFor(serverUrl).call('login', { username, password }));
    },

    logout: async () => {
      const { serverUrl } = get();
      const refreshToken = await storage.get(StorageKeys.refreshToken);
      if (serverUrl && refreshToken) {
        // Best effort: the local session is cleared even if the server can't be reached.
        await clientFor(serverUrl)
          .call('logout', { refreshToken })
          .catch(() => undefined);
      }
      await dropSession();
    },

    call: async (name, ...args) => {
      const { serverUrl } = get();
      if (!serverUrl) throw new Error('No server configured');
      const client = clientFor(serverUrl, () => get().accessToken ?? undefined);
      try {
        return await client.call(name, ...args);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'UNAUTHORIZED' && (await refresh())) {
          return client.call(name, ...args);
        }
        if (err instanceof ApiError && err.code === 'UNAUTHORIZED') await dropSession();
        throw err;
      }
    },
  };
});

export type { Me };
