import { libraryUnavailable } from './errors.js';

export type Fetch = typeof fetch;

export interface CwaWebOptions {
  baseUrl: string;
  username: string;
  password: string;
  fetch?: Fetch;
  /** Per-request timeout. */
  timeoutMs?: number;
}

const CSRF_INPUT = /name="csrf_token"\s+value="([^"]+)"/;

/** Pulls the CSRF token out of any CWA page (every form carries a hidden `csrf_token`). */
export function extractCsrfToken(html: string): string | null {
  return CSRF_INPUT.exec(html)?.[1] ?? null;
}

function isLoginRedirect(res: Response): boolean {
  const location = res.headers.get('location');
  if (res.status < 300 || res.status >= 400 || !location) return false;
  return new URL(location, 'http://cwa.invalid').pathname.replace(/\/+$/, '').endsWith('/login');
}

/**
 * A logged-in browser session on CWA's web UI as the broker's service
 * account. CWA has no official API, so this is a cookie jar plus the CSRF
 * token from its forms. CWA rate-limits logins (3 a minute per user), so the
 * session is kept and only renewed when CWA sends us back to the login page.
 */
export class CwaWebSession {
  private readonly baseUrl: string;
  private readonly fetchFn: Fetch;
  private readonly timeoutMs: number;
  private readonly cookies = new Map<string, string>();
  private csrfToken: string | null = null;
  private loggingIn: Promise<string> | null = null;

  constructor(private readonly opts: CwaWebOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  get loggedIn(): boolean {
    return this.csrfToken !== null;
  }

  /** Logs in (once, even when called concurrently). */
  async login(): Promise<void> {
    await this.freshLogin();
  }

  private freshLogin(): Promise<string> {
    this.loggingIn ??= this.doLogin().finally(() => {
      this.loggingIn = null;
    });
    return this.loggingIn;
  }

  /**
   * POSTs a form as the service account with the CSRF token CWA expects
   * (as a form field and as the `X-CSRFToken` header its AJAX endpoints read).
   */
  post(path: string, form: Record<string, string> = {}): Promise<Response> {
    return this.withSession(path, (csrf) =>
      this.send(path, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrftoken': csrf },
        body: new URLSearchParams({ csrf_token: csrf, ...form }).toString(),
      }),
    );
  }

  /** GETs a page as the service account. */
  get(path: string): Promise<Response> {
    return this.withSession(path, () => this.send(path, { method: 'GET' }));
  }

  /** Logs in first if needed, and once more if the session has expired. */
  private async withSession(
    path: string,
    call: (csrf: string) => Promise<Response>,
  ): Promise<Response> {
    let res = await call(this.csrfToken ?? (await this.freshLogin()));
    if (isLoginRedirect(res) || res.status === 401) {
      this.csrfToken = null;
      res = await call(await this.freshLogin());
    }
    if (isLoginRedirect(res) || res.status === 401) {
      throw libraryUnavailable('CWA keeps asking the broker to log in', { path });
    }
    return res;
  }

  private async doLogin(): Promise<string> {
    this.cookies.clear();
    this.csrfToken = null;
    const page = await this.send('/login', { method: 'GET' });
    const loginCsrf = extractCsrfToken(await page.text());
    if (!page.ok || !loginCsrf) {
      throw libraryUnavailable('CWA login page has no CSRF token', { status: page.status });
    }

    const res = await this.send('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrf_token: loginCsrf,
        username: this.opts.username,
        password: this.opts.password,
        remember_me: 'on',
        next: '/',
      }).toString(),
    });
    if (res.status === 429) throw libraryUnavailable('CWA is rate-limiting the broker login');
    if (res.status < 300 || res.status >= 400 || isLoginRedirect(res)) {
      throw libraryUnavailable('CWA rejected the service account login', { status: res.status });
    }

    // The session may have a new CSRF secret after login: read it from a logged-in page.
    const home = await this.send('/', { method: 'GET' });
    const token = extractCsrfToken(await home.text());
    if (isLoginRedirect(home) || !token) {
      throw libraryUnavailable('CWA did not keep the service account session', {
        status: home.status,
      });
    }
    this.csrfToken = token;
    return token;
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size) {
      headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    }
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw libraryUnavailable('Cannot reach CWA', { path, cause: (err as Error).message });
    }
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return res;
  }
}

export interface KoboTagItem {
  Type: 'ProductRevisionTagItem';
  RevisionId: string;
}

/**
 * The Kobo sync API as a given reader, authenticated by that reader's own
 * Kobo sync token. CWA only lets a shelf's owner change a private shelf,
 * so shelf edits go through here (ADR 0021). The token is part of the URL:
 * it is never logged or put in an error.
 */
export class CwaKoboApi {
  private readonly baseUrl: string;
  private readonly fetchFn: Fetch;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; fetch?: Fetch; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  addToShelf(token: string, shelfUuid: string, bookUuids: string[]): Promise<void> {
    return this.tagItems(
      token,
      `/v1/library/tags/${encodeURIComponent(shelfUuid)}/items`,
      bookUuids,
    );
  }

  removeFromShelf(token: string, shelfUuid: string, bookUuids: string[]): Promise<void> {
    return this.tagItems(
      token,
      `/v1/library/tags/${encodeURIComponent(shelfUuid)}/items/delete`,
      bookUuids,
    );
  }

  private async tagItems(token: string, path: string, bookUuids: string[]): Promise<void> {
    const items: KoboTagItem[] = bookUuids.map((uuid) => ({
      Type: 'ProductRevisionTagItem',
      RevisionId: uuid,
    }));
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/kobo/${encodeURIComponent(token)}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ Items: items }),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw libraryUnavailable('Cannot reach CWA', { path, cause: (err as Error).message });
    }
    if (!res.ok) {
      throw libraryUnavailable('CWA refused the Kobo shelf change', { path, status: res.status });
    }
  }
}
