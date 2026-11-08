import { appVersionCode } from '@purrshelf/contract';
import { z } from 'zod';
import { USER_AGENT, type HttpOptions } from '../discover/http.js';

/** Raised when the newest app release can't be found or fetched. */
export class AppUpdateError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppUpdateError';
  }
}

/** The newest published app release and its APK, before it is downloaded. */
export interface LatestApp {
  version: string;
  versionCode: number;
  notes: string;
  publishedAt: string;
  apk: {
    url: string;
    size: number;
    /** Hex SHA-256 from GitHub's asset digest, when GitHub reports one. */
    sha256?: string;
  };
}

/** Where the broker learns about app releases; tests use a fake. */
export interface AppReleaseSource {
  /** Newest published release with an APK, or null when there is none. */
  latest(): Promise<LatestApp | null>;
}

const Asset = z.object({
  name: z.string(),
  size: z.number().int().positive(),
  browser_download_url: z.string(),
  digest: z.string().nullish(),
});

const Release = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  body: z.string().nullish(),
  published_at: z.string().nullish(),
  assets: z.array(Asset),
});

const TAG = /^mobile-v(\d+\.\d+\.\d+)$/;
const MAX_NOTES = 4000;

/** Picks the newest published `mobile-vX.Y.Z` release that carries an APK. */
export function pickLatest(raw: unknown): LatestApp | null {
  const releases = z.array(z.unknown()).parse(raw);
  let best: LatestApp | null = null;
  for (const item of releases) {
    const parsed = Release.safeParse(item);
    if (!parsed.success) continue;
    const release = parsed.data;
    const version = TAG.exec(release.tag_name)?.[1];
    if (!version || release.draft || release.prerelease || !release.published_at) continue;
    const versionCode = appVersionCode(version);
    const asset = release.assets.find((a) => a.name.endsWith('.apk'));
    if (versionCode === null || !asset) continue;
    if (best && best.versionCode >= versionCode) continue;
    const sha256 = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? '')?.[1];
    best = {
      version,
      versionCode,
      notes: (release.body ?? '').slice(0, MAX_NOTES),
      publishedAt: new Date(release.published_at).toISOString(),
      apk: { url: asset.browser_download_url, size: asset.size, ...(sha256 ? { sha256 } : {}) },
    };
  }
  return best;
}

/** Reads releases of a public GitHub repository (no token needed). */
export class GitHubReleases implements AppReleaseSource {
  constructor(
    private readonly repo: string,
    private readonly http: HttpOptions,
  ) {}

  async latest(): Promise<LatestApp | null> {
    const url = `https://api.github.com/repos/${this.repo}/releases?per_page=30`;
    let res: Response;
    try {
      res = await this.http.fetch(url, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(this.http.timeoutMs),
      });
    } catch (cause) {
      throw new AppUpdateError('GitHub could not be reached', { cause });
    }
    if (!res.ok) throw new AppUpdateError(`GitHub answered ${res.status} for the releases`);
    try {
      return pickLatest(await res.json());
    } catch (cause) {
      throw new AppUpdateError('GitHub sent releases we could not read', { cause });
    }
  }
}
