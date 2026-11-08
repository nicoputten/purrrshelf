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

/** Cat-styled names for the changelog sections release-please writes (ADR 0033). */
const SECTION_NAMES: Record<string, string> = {
  features: 'New tricks',
  'bug fixes': 'Fixed scratches',
  'performance improvements': 'Faster paws',
};

/** Ticket ids such as `(DES-02)` or `(BRK-10, APP-10)`. */
const TICKETS = /\s*\((?:[A-Z]+-\d+)(?:,\s*[A-Z]+-\d+)*\)/g;
/** A commit link such as `([6aa1dd0](https://…))`. */
const COMMIT_LINK = /\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/g;

/**
 * Turns release notes as release-please writes them into short plain text for
 * people (ADR 0033): no version heading, links, commit hashes, scopes or
 * ticket ids; cat-styled section names; server-only (`broker`) lines left out.
 * Text that is already plain passes through unchanged.
 */
export function readableReleaseNotes(markdown: string): string {
  const out: string[] = [];
  let section: string | null = null;
  let items: string[] = [];
  const flush = () => {
    if (items.length) {
      if (section) out.push(section);
      out.push(...items, '');
    }
    items = [];
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^##(?!#)/.test(line)) continue;
    const heading = /^#{3,}\s*(.+)$/.exec(line);
    if (heading) {
      flush();
      const name = (heading[1] ?? '').trim();
      section = SECTION_NAMES[name.toLowerCase()] ?? name;
      continue;
    }
    const bullet = /^[*-]\s+(.*)$/.exec(line);
    let text = bullet ? (bullet[1] ?? '') : line;
    const scope = /^\*\*([\w-]+):\*\*\s*/.exec(text);
    if (scope) {
      if (scope[1] === 'broker') continue;
      text = text.slice(scope[0].length);
    }
    text = text
      .replace(COMMIT_LINK, '')
      .replace(TICKETS, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|__|`/g, '')
      .trim();
    if (!text) continue;
    text = text.charAt(0).toUpperCase() + text.slice(1);
    items.push(bullet ? `• ${text}` : text);
  }
  flush();
  return out.join('\n').trim();
}
