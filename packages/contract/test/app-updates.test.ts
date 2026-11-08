import { describe, expect, it } from 'vitest';
import { AppRelease, appApkUrl, appVersionCode } from '../src/index.js';

describe('appVersionCode', () => {
  it('packs major, minor and patch into a growing number', () => {
    expect(appVersionCode('1.0.0')).toBe(1_000_000);
    expect(appVersionCode('1.2.3')).toBe(1_002_003);
    expect(appVersionCode('1.10.0')!).toBeGreaterThan(appVersionCode('1.9.999')!);
  });

  it('gives null for versions it cannot order', () => {
    expect(appVersionCode('1.0.0-beta.1')).toBeNull();
    expect(appVersionCode('v1.0.0')).toBeNull();
    expect(appVersionCode('1.1000.0')).toBeNull();
  });
});

describe('AppRelease', () => {
  it('needs a hex SHA-256', () => {
    const release = {
      version: '1.2.0',
      versionCode: 1_002_000,
      sha256: 'a'.repeat(64),
      size: 1234,
      notes: '',
      publishedAt: '2026-01-01T00:00:00Z',
    };
    expect(AppRelease.parse(release)).toEqual(release);
    expect(() => AppRelease.parse({ ...release, sha256: 'xyz' })).toThrow();
  });
});

describe('appApkUrl', () => {
  it('builds the download URL from the server URL', () => {
    expect(appApkUrl('https://books.example.invalid/')).toBe(
      'https://books.example.invalid/api/v1/app/latest.apk',
    );
  });
});
