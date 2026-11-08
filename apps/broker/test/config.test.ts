import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe defaults when nothing is set', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ HOST: '0.0.0.0', PORT: 8080, LOG_LEVEL: 'info' });
  });

  it('coerces the port from a string', () => {
    expect(loadConfig({ PORT: '9000' }).PORT).toBe(9000);
  });

  it('rejects an invalid port with a readable message', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigError);
    try {
      loadConfig({ PORT: 'abc' });
    } catch (err) {
      expect((err as ConfigError).issues[0]).toMatch(/^PORT:/);
    }
  });
});
