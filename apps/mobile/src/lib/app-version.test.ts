import appConfig, { versionCodeFor } from '../../app.config';
import pkg from '../../package.json';

describe('versionCodeFor', () => {
  it('packs major, minor and patch into one growing number', () => {
    expect(versionCodeFor('1.0.0')).toBe(1_000_000);
    expect(versionCodeFor('1.2.3')).toBe(1_002_003);
    expect(versionCodeFor('1.10.0')).toBeGreaterThan(versionCodeFor('1.9.999'));
    expect(versionCodeFor('2.0.0')).toBeGreaterThan(versionCodeFor('1.999.999'));
  });

  it('refuses versions it cannot order', () => {
    expect(() => versionCodeFor('1.0.0-beta.1')).toThrow('plain semver');
    expect(() => versionCodeFor('1.0')).toThrow('plain semver');
    expect(() => versionCodeFor('1.1000.0')).toThrow('out of range');
  });
});

describe('app config', () => {
  it('takes the version from package.json', () => {
    const config = appConfig({ config: { name: 'Purrshelf', slug: 'purrshelf' } } as never);
    expect(config.version).toBe(pkg.version);
    expect(config.android?.versionCode).toBe(versionCodeFor(pkg.version));
  });
});
