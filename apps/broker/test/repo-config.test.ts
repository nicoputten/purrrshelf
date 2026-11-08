import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const cwaImage = (compose: string) => compose.match(/calibre-web-automated:(\S+)/)?.[1];

describe('repo configuration', () => {
  it('pins the same CWA version in the deploy example and the test stack (ADR 0017)', () => {
    const deployed = cwaImage(read('deploy/docker-compose.example.yml'));
    expect(deployed).toBe('v4.0.8');
    expect(cwaImage(read('test/stack/docker-compose.yml'))).toBe(deployed);
  });

  it('documents every CWA setting in .env.example with placeholder values only', () => {
    const env = Object.fromEntries(
      read('.env.example')
        .split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => l.split(/=(.*)/s).slice(0, 2) as [string, string]),
    );
    expect(env).toMatchObject({
      CWA_KOBO_SHELF_NAME: 'Kobo',
      CALIBRE_LIBRARY_PATH: '/calibre-library',
      CWA_INGEST_PATH: '/cwa-book-ingest',
    });
    expect(env.CWA_BASE_URL).toMatch(/\.example\.invalid/);
    expect(env.CWA_SERVICE_USER).toBe('change-me');
    expect(env.CWA_SERVICE_PASSWORD).toBe('change-me');
    for (const [key, value] of Object.entries(env)) {
      if (/(KEY|TOKEN|PASSWORD|SECRET)$/.test(key))
        expect([key, value]).toEqual([key, expect.stringMatching(/^(change-me|0+)/)]);
      if (/_URL$/.test(key))
        expect([key, value]).toEqual([key, expect.stringMatching(/\.example\.invalid/)]);
    }
  });
});
