import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRelease, TokenPair } from '@purrshelf/contract';
import { AppUpdateError, pickLatest } from '../src/modules/app-updates/github.js';
import { AppUpdates } from '../src/modules/app-updates/service.js';
import { TestClock, login, makeTestApp, testConfig, type TestContext } from './helpers.js';

const REPO = 'example-owner/purrshelf-example';
const API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const ASSET_URL = 'https://github.com/example-owner/purrshelf-example/releases/download/x.apk';
const STORAGE_URL = 'https://release-assets.example-cdn.invalid/x.apk';

const apk = (fill = 1, size = 4096) => Buffer.alloc(size, fill);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function release(version: string, body: Buffer, extra: Record<string, unknown> = {}) {
  return {
    tag_name: `mobile-v${version}`,
    draft: false,
    prerelease: false,
    body: `Notes for ${version}`,
    published_at: '2026-11-08T12:00:00Z',
    assets: [
      { name: 'notes.txt', size: 3, browser_download_url: 'https://x.example.invalid/n' },
      {
        name: `purrshelf-${version}-arm64-v8a.apk`,
        size: body.length,
        browser_download_url: ASSET_URL,
        digest: `sha256:${sha(body)}`,
      },
    ],
    ...extra,
  };
}

/** A fake GitHub: the releases API, a redirect to storage, then the bytes. */
function fakeGitHub(state: { releases: unknown[]; body: Buffer; calls?: string[] }) {
  return async (input: string): Promise<Response> => {
    state.calls?.push(input);
    if (input === API) return Response.json(state.releases);
    if (input === ASSET_URL)
      return new Response(null, { status: 302, headers: { location: STORAGE_URL } });
    if (input === STORAGE_URL)
      return new Response(new Uint8Array(state.body), {
        headers: { 'content-length': String(state.body.length) },
      });
    throw new Error(`unexpected request to ${input}`);
  };
}

describe('pickLatest', () => {
  it('takes the newest published mobile release with an APK', () => {
    const body = apk();
    const latest = pickLatest([
      release('1.3.0', body, { draft: true }),
      release('1.2.1', body, { prerelease: true }),
      { ...release('9.9.9', body), tag_name: 'broker-v9.9.9' },
      release('1.1.0', body),
      release('1.2.0', body),
      release('1.4.0', body, { assets: [] }),
      { junk: true },
    ]);
    expect(latest).toMatchObject({
      version: '1.2.0',
      versionCode: 1_002_000,
      notes: 'Notes for 1.2.0',
      publishedAt: '2026-11-08T12:00:00.000Z',
      apk: { url: ASSET_URL, size: body.length, sha256: sha(body) },
    });
  });

  it('gives null without a usable release and leaves out a digest GitHub does not report', () => {
    expect(pickLatest([])).toBeNull();
    const body = apk();
    const r = release('1.0.0', body);
    (r.assets[1] as { digest?: string | null }).digest = null;
    expect(pickLatest([r])!.apk.sha256).toBeUndefined();
  });
});

function updates(
  state: { releases: unknown[]; body: Buffer; calls?: string[] },
  over: Partial<ConstructorParameters<typeof AppUpdates>[0]> = {},
) {
  const clock = new TestClock();
  const dir = mkdtempSync(join(tmpdir(), 'purrshelf-apk-'));
  const warnings: unknown[] = [];
  const fetch = fakeGitHub(state);
  const service = new AppUpdates({
    source: {
      latest: async () => pickLatest(await (await fetch(API)).json()),
    },
    dir,
    fetch,
    clock: clock.fn,
    checkIntervalMs: 60 * 60_000,
    maxBytes: 1024 * 1024,
    log: { warn: (o: unknown) => void warnings.push(o) },
    ...over,
  });
  return { service, clock, dir, warnings };
}

describe('AppUpdates', () => {
  it('downloads the APK once, checks it and caches the answer', async () => {
    const body = apk();
    const state = { releases: [release('1.2.0', body)], body, calls: [] as string[] };
    const { service, clock, dir } = updates(state);
    const [a, b] = await Promise.all([service.latest(), service.latest()]);
    expect(a).toBe(b);
    expect(a.release).toEqual({
      version: '1.2.0',
      versionCode: 1_002_000,
      sha256: sha(body),
      size: body.length,
      notes: 'Notes for 1.2.0',
      publishedAt: '2026-11-08T12:00:00.000Z',
    });
    expect(readdirSync(dir)).toEqual(['purrshelf-1.2.0.apk']);
    expect(state.calls).toEqual([API, ASSET_URL, STORAGE_URL]);

    clock.advance(30 * 60_000);
    await service.latest();
    expect(state.calls).toHaveLength(3);

    // After the interval GitHub is asked again; the same version is not downloaded again.
    clock.advance(31 * 60_000);
    await service.latest();
    expect(state.calls).toEqual([API, ASSET_URL, STORAGE_URL, API]);
  });

  it('replaces the APK when a newer release appears', async () => {
    const old = apk(1);
    const state = { releases: [release('1.2.0', old)], body: old };
    const { service, clock, dir } = updates(state);
    writeFileSync(join(dir, 'leftover.part'), 'x');
    await service.latest();
    const next = apk(2, 5000);
    state.releases = [release('1.3.0', next), release('1.2.0', old)];
    state.body = next;
    clock.advance(61 * 60_000);
    const ready = await service.latest();
    expect(ready.release.version).toBe('1.3.0');
    expect(ready.release.sha256).toBe(sha(next));
    expect(readdirSync(dir)).toEqual(['purrshelf-1.3.0.apk']);
  });

  it('keeps serving the known release when GitHub fails later', async () => {
    const body = apk();
    const state = { releases: [release('1.2.0', body)], body };
    let fail = false;
    const fetch = fakeGitHub(state);
    const { service, clock, warnings } = updates(state, {
      source: {
        latest: async () => {
          if (fail) throw new AppUpdateError('GitHub answered 500 for the releases');
          return pickLatest(await (await fetch(API)).json());
        },
      },
    });
    await service.latest();
    fail = true;
    clock.advance(61 * 60_000);
    expect((await service.latest()).release.version).toBe('1.2.0');
    expect(warnings).toHaveLength(1);
  });

  it.each([
    [
      'a digest mismatch',
      (s: { releases: unknown[]; body: Buffer }) => (s.body = apk(9)),
      'does not match',
    ],
    [
      'a size mismatch',
      (s: { releases: unknown[]; body: Buffer }) => (s.body = apk(1, 100)),
      'GitHub said',
    ],
  ])('refuses %s and leaves no file behind', async (_label, tamper, message) => {
    const body = apk();
    const state = { releases: [release('1.2.0', body)], body };
    tamper(state);
    const { service, dir } = updates(state);
    await expect(service.latest()).rejects.toThrow(message);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('refuses an APK above the size cap', async () => {
    const body = apk(1, 4096);
    const { service } = updates({ releases: [release('1.2.0', body)], body }, { maxBytes: 1000 });
    await expect(service.latest()).rejects.toThrow('too large');
  });

  it('stops a download that grows past the cap', async () => {
    const body = apk(1, 4096);
    const r = release('1.2.0', body);
    (r.assets[1] as { size: number }).size = 10;
    const { service, dir } = updates({ releases: [r], body }, { maxBytes: 1000 });
    await expect(service.latest()).rejects.toThrow('too large');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('says so when there is no release yet', async () => {
    const { service } = updates({ releases: [], body: apk() });
    await expect(service.latest()).rejects.toThrow('no app release');
  });

  it('only follows https redirects to public hosts', async () => {
    const body = apk();
    const { service } = updates(
      { releases: [release('1.2.0', body)], body },
      {
        fetch: async () =>
          new Response(null, { status: 302, headers: { location: 'http://192.168.1.2/x.apk' } }),
      },
    );
    await expect(service.latest()).rejects.toThrow('refusing APK URL');
  });

  it.each([
    ['an error status', async () => new Response('no', { status: 404 }), 'answered 404'],
    ['a redirect without location', async () => new Response(null, { status: 302 }), 'location'],
    [
      'a network error',
      async () => {
        throw new Error('offline');
      },
      'failed',
    ],
  ])('fails cleanly on %s', async (_label, fetch, message) => {
    const body = apk();
    const { service } = updates({ releases: [release('1.2.0', body)], body }, { fetch });
    await expect(service.latest()).rejects.toThrow(message);
  });

  it('gives up after too many redirects', async () => {
    const body = apk();
    const { service } = updates(
      { releases: [release('1.2.0', body)], body },
      {
        fetch: async () => new Response(null, { status: 302, headers: { location: ASSET_URL } }),
      },
    );
    await expect(service.latest()).rejects.toThrow('too many redirects');
  });
});

describe('app update routes', () => {
  let ctx: TestContext;
  afterEach(async () => {
    await ctx?.close();
  });

  async function token() {
    return TokenPair.parse((await login(ctx.app)).json()).accessToken;
  }

  it('answers APP_UPDATE_UNAVAILABLE when no release repo is set', async () => {
    ctx = await makeTestApp();
    const res = await ctx.app.inject({
      url: '/api/v1/app/latest',
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'APP_UPDATE_UNAVAILABLE' });
  });

  it('needs a login', async () => {
    ctx = await makeTestApp({ config: { APP_RELEASES_REPO: REPO } });
    for (const url of ['/api/v1/app/latest', '/api/v1/app/latest.apk']) {
      expect((await ctx.app.inject({ url })).statusCode).toBe(401);
    }
  });

  it('serves the latest release and its APK from GitHub', async () => {
    const body = apk(7);
    ctx = await makeTestApp({
      config: { APP_RELEASES_REPO: REPO },
      fetch: fakeGitHub({ releases: [release('1.2.0', body)], body }),
    });
    const headers = { authorization: `Bearer ${await token()}` };
    const info = await ctx.app.inject({ url: '/api/v1/app/latest', headers });
    expect(info.statusCode).toBe(200);
    expect(AppRelease.parse(info.json())).toMatchObject({ version: '1.2.0', sha256: sha(body) });

    const file = await ctx.app.inject({ url: '/api/v1/app/latest.apk', headers });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(file.headers['content-disposition']).toContain('purrshelf-1.2.0.apk');
    expect(sha(file.rawPayload)).toBe(sha(body));
  });

  it('answers APP_UPDATE_UNAVAILABLE when GitHub fails', async () => {
    ctx = await makeTestApp({
      config: { APP_RELEASES_REPO: REPO },
      fetch: async () => new Response('down', { status: 502 }),
    });
    const res = await ctx.app.inject({
      url: '/api/v1/app/latest.apk',
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'APP_UPDATE_UNAVAILABLE' });
  });
});

describe('APP_RELEASES_REPO', () => {
  it('is off for the placeholder and must look like owner/name', () => {
    expect(testConfig({ APP_RELEASES_REPO: 'change-me' }).APP_RELEASES_REPO).toBeUndefined();
    expect(testConfig({ APP_RELEASES_REPO: REPO }).APP_RELEASES_REPO).toBe(REPO);
    expect(() => testConfig({ APP_RELEASES_REPO: 'https://evil.example.invalid/x' })).toThrow();
  });
});
