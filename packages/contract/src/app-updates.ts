import { z } from 'zod';

/**
 * Turns a plain semver version into the Android versionCode the APK carries
 * (ADR 0031): major * 1_000_000 + minor * 1_000 + patch. Returns null when the
 * version is not plain x.y.z or a part is out of range.
 * `apps/mobile/app.config.ts` keeps an identical copy for the build.
 */
export function appVersionCode(version: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  if (minor > 999 || patch > 999) return null;
  return major * 1_000_000 + minor * 1_000 + patch;
}

/** The newest app release the broker knows about (BRK-10). */
export const AppRelease = z
  .object({
    version: z.string(),
    versionCode: z.number().int().positive(),
    /** Hex SHA-256 of the APK, checked by the app before it installs. */
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().positive(),
    /** Release notes (Markdown), possibly empty. */
    notes: z.string(),
    publishedAt: z.iso.datetime(),
  })
  .meta({ id: 'AppRelease' });
export type AppRelease = z.infer<typeof AppRelease>;

/** `GET /app/latest.apk` streams the APK of {@link AppRelease}; it is not JSON. */
export const appApkPath = '/app/latest.apk';

/** Full URL of the latest APK, for the app's download. */
export function appApkUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/v1${appApkPath}`;
}
