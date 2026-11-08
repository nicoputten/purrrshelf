import type { ConfigContext, ExpoConfig } from 'expo/config';

import pkg from './package.json';

/**
 * Turns a semver version into an Android versionCode (ADR 0031):
 * major * 1_000_000 + minor * 1_000 + patch. Minor and patch must stay
 * below 1000 so codes keep growing with every release.
 */
export function versionCodeFor(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`app version "${version}" is not plain semver (x.y.z)`);
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  if (minor > 999 || patch > 999) throw new Error(`app version "${version}" is out of range`);
  return major * 1_000_000 + minor * 1_000 + patch;
}

/** app.json holds the static config; the version comes from package.json (release-please bumps it). */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Purrshelf',
  slug: config.slug ?? 'purrshelf',
  version: pkg.version,
  android: { ...config.android, versionCode: versionCodeFor(pkg.version) },
});
