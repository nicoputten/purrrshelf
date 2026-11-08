import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { AppRelease } from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import type { Clock } from '../../clock.js';
import { USER_AGENT, type FetchLike } from '../discover/http.js';
import { AppUpdateError, type AppReleaseSource, type LatestApp } from './github.js';

export interface AppUpdatesDeps {
  source: AppReleaseSource;
  /** Folder for the downloaded APK (APP_UPDATES_PATH). */
  dir: string;
  fetch: FetchLike;
  clock: Clock;
  /** How long an answer is reused before GitHub is asked again. */
  checkIntervalMs: number;
  maxBytes: number;
  /** Per-request timeout for the APK download. */
  downloadTimeoutMs?: number;
  log: Pick<FastifyBaseLogger, 'warn'>;
}

export interface ReadyApp {
  release: AppRelease;
  /** The APK on disk, matching `release.sha256`. */
  path: string;
}

const MAX_REDIRECTS = 5;

/** Only public https hosts: never an IP literal or localhost. */
function safeUrl(raw: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new AppUpdateError('not an APK URL');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || isIP(host) || host === 'localhost' || !host.includes('.')) {
    throw new AppUpdateError(`refusing APK URL on ${host}`);
  }
  return url;
}

/**
 * Knows the newest app release and keeps its APK on disk (BRK-10, ADR 0031).
 * GitHub is only asked when the app asks, at most once per check interval;
 * the APK is downloaded once per version and checked against GitHub's digest.
 */
export class AppUpdates {
  private ready: ReadyApp | null = null;
  private checkedAt = 0;
  private inflight: Promise<ReadyApp> | null = null;

  constructor(private readonly deps: AppUpdatesDeps) {}

  /** The newest release with its APK ready to serve. Throws {@link AppUpdateError}. */
  latest(): Promise<ReadyApp> {
    const now = this.deps.clock().getTime();
    if (this.ready && now - this.checkedAt < this.deps.checkIntervalMs) {
      return Promise.resolve(this.ready);
    }
    this.inflight ??= this.refresh(now).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(now: number): Promise<ReadyApp> {
    let info: LatestApp | null;
    try {
      info = await this.deps.source.latest();
    } catch (err) {
      // Keep serving the APK we have rather than failing the app's check.
      if (this.ready) {
        this.deps.log.warn({ err }, 'app release check failed; keeping the known release');
        this.checkedAt = now;
        return this.ready;
      }
      throw err;
    }
    if (!info) throw new AppUpdateError('no app release with an APK yet');
    if (this.ready && this.ready.release.versionCode === info.versionCode) {
      this.checkedAt = now;
      return this.ready;
    }
    if (info.apk.size > this.deps.maxBytes) throw new AppUpdateError('the APK is too large');

    await mkdir(this.deps.dir, { recursive: true });
    const name = `purrshelf-${info.version}.apk`;
    const path = join(this.deps.dir, name);
    const sha256 = await this.download(info, path);
    await this.removeOthers(name);
    this.ready = {
      release: {
        version: info.version,
        versionCode: info.versionCode,
        sha256,
        size: info.apk.size,
        notes: info.notes,
        publishedAt: info.publishedAt,
      },
      path,
    };
    this.checkedAt = now;
    return this.ready;
  }

  /** Downloads the APK to `path` (via a temp file) and returns its SHA-256. */
  private async download(info: LatestApp, path: string): Promise<string> {
    const res = await this.open(info.apk.url);
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > this.deps.maxBytes) throw new AppUpdateError('the APK is too large');
    if (!res.body) throw new AppUpdateError('the APK download was empty');

    const temp = `${path}.${randomUUID()}.part`;
    const hash = createHash('sha256');
    let bytes = 0;
    const max = this.deps.maxBytes;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        bytes += chunk.length;
        if (bytes > max) return done(new AppUpdateError('the APK is too large'));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(res.body as WebReadableStream),
        meter,
        createWriteStream(temp, { mode: 0o644 }),
      );
      if (bytes !== info.apk.size) {
        throw new AppUpdateError(`the APK has ${bytes} bytes, GitHub said ${info.apk.size}`);
      }
      const sha256 = hash.digest('hex');
      if (info.apk.sha256 && info.apk.sha256 !== sha256) {
        throw new AppUpdateError('the APK does not match the digest GitHub reports');
      }
      await rename(temp, path);
      return sha256;
    } catch (err) {
      await rm(temp, { force: true });
      if (err instanceof AppUpdateError) throw err;
      throw new AppUpdateError('the APK download failed', { cause: err });
    }
  }

  /** GETs the APK, following redirects by hand so every hop is checked. */
  private async open(raw: string): Promise<Response> {
    let url = safeUrl(raw);
    for (let hop = 0; ; hop++) {
      let res: Response;
      try {
        res = await this.deps.fetch(url.toString(), {
          headers: { accept: 'application/octet-stream', 'user-agent': USER_AGENT },
          redirect: 'manual',
          signal: AbortSignal.timeout(this.deps.downloadTimeoutMs ?? 5 * 60_000),
        });
      } catch (cause) {
        throw new AppUpdateError(`APK download from ${url.hostname} failed`, { cause });
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new AppUpdateError(`${url.hostname} redirected without a location`);
        if (hop >= MAX_REDIRECTS) throw new AppUpdateError('too many redirects for the APK');
        url = safeUrl(location, url);
        continue;
      }
      if (!res.ok) throw new AppUpdateError(`${url.hostname} answered ${res.status} for the APK`);
      return res;
    }
  }

  /** Only the newest APK is kept. */
  private async removeOthers(keep: string): Promise<void> {
    for (const name of await readdir(this.deps.dir)) {
      if (name === keep) continue;
      const path = join(this.deps.dir, name);
      if ((await stat(path)).isFile()) await rm(path, { force: true });
    }
  }
}
