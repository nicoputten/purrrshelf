import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config.js';
import { CwaAdapter, createLibrary } from '../../src/modules/library/index.js';
import { makeTestApp, testConfig, type TestContext } from '../helpers.js';
import { BASE_URL, FakeCwa, SERVICE } from './fake-cwa.js';

const cwaEnv = {
  CWA_BASE_URL: BASE_URL,
  CWA_SERVICE_USER: SERVICE.username,
  CWA_SERVICE_PASSWORD: SERVICE.password,
};

let ctx: TestContext | undefined;
let cwa: FakeCwa | undefined;
afterEach(async () => {
  await ctx?.close();
  cwa?.close();
  ctx = undefined;
  cwa = undefined;
});

describe('CWA config', () => {
  it('is off without CWA_BASE_URL and has the ADR 0017 defaults', () => {
    const config = testConfig();
    expect(config).toMatchObject({
      CWA_KOBO_SHELF_NAME: 'Kobo',
      CALIBRE_LIBRARY_PATH: '/calibre-library',
      CWA_CONFIG_PATH: '/cwa-config',
      CWA_INGEST_PATH: '/cwa-book-ingest',
    });
    expect(createLibrary(config)).toBeNull();
  });

  it('needs the service account with CWA_BASE_URL', () => {
    expect(() => testConfig({ CWA_BASE_URL: BASE_URL })).toThrow(ConfigError);
    expect(() => testConfig({ CWA_BASE_URL: BASE_URL })).toThrow(
      /CWA_SERVICE_USER: required with CWA_BASE_URL[\s\S]*CWA_SERVICE_PASSWORD/,
    );
    expect(() => testConfig({ ...cwaEnv, CWA_BASE_URL: 'not a url' })).toThrow(/CWA_BASE_URL/);
  });

  it('builds the CWA adapter from the library and config paths', async () => {
    cwa = new FakeCwa();
    const library = createLibrary(
      testConfig({ ...cwaEnv, CALIBRE_LIBRARY_PATH: cwa.dir, CWA_CONFIG_PATH: cwa.dir }),
      cwa.fetch,
    );
    expect(library).toBeInstanceOf(CwaAdapter);
    await expect(library!.ping()).resolves.toBeUndefined();
    library!.close();
  });
});

describe('library health check', () => {
  it('shows up in /health when the library is configured', async () => {
    cwa = new FakeCwa();
    ctx = await makeTestApp({ library: cwa.adapter() });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.json()).toMatchObject({
      status: 'ok',
      checks: [{ name: 'database' }, { name: 'library', status: 'ok' }],
    });

    cwa.behaviour.override = () => new Response('down', { status: 503 });
    cwa.expireSessions();
    const fresh = await makeTestApp({ library: cwa.adapter() });
    const degraded = await fresh.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(degraded.json()).toMatchObject({
      status: 'degraded',
      checks: [{ name: 'database' }, { name: 'library', status: 'fail' }],
    });
    await fresh.close();
  });
});
