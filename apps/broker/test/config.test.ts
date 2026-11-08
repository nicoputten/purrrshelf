import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';
import { TEST_SECRET } from './helpers.js';

describe('loadConfig', () => {
  it('uses safe defaults for everything except the secret', () => {
    const config = loadConfig({ JWT_SECRET: TEST_SECRET });
    expect(config).toMatchObject({
      HOST: '0.0.0.0',
      PORT: 8080,
      LOG_LEVEL: 'info',
      DATABASE_PATH: '/data/purrshelf.db',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('coerces numbers from strings', () => {
    expect(loadConfig({ JWT_SECRET: TEST_SECRET, PORT: '9000' }).PORT).toBe(9000);
  });

  it('requires a JWT secret of at least 32 characters', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET: must be at least 32/);
  });

  it('rejects an invalid port with a readable message', () => {
    try {
      loadConfig({ JWT_SECRET: TEST_SECRET, PORT: 'abc' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).issues[0]).toMatch(/^PORT:/);
    }
  });
});

describe('TRUST_PROXY', () => {
  const load = (TRUST_PROXY?: string) =>
    loadConfig({ JWT_SECRET: TEST_SECRET, ...(TRUST_PROXY === undefined ? {} : { TRUST_PROXY }) })
      .TRUST_PROXY;

  it('trusts private networks by default', () => {
    expect(load()).toBe('loopback,linklocal,uniquelocal');
  });

  it('accepts a list of proxy addresses', () => {
    expect(load(' 172.18.0.0/16, 127.0.0.1 ')).toBe('172.18.0.0/16, 127.0.0.1');
  });

  it.each(['none', 'false', 'NONE'])('trusts nobody for %s', (value) => {
    expect(load(value)).toBe(false);
  });

  it.each(['true', 'TRUE'])('refuses to trust every peer (%s)', (value) => {
    expect(() => load(value)).toThrow(/TRUST_PROXY: trusting every peer/);
  });

  it('refuses an empty value', () => {
    expect(() => load('  ')).toThrow(/TRUST_PROXY: use "none"/);
  });
});
