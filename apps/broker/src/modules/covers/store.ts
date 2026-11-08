import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CoverSize } from '@purrshelf/contract';
import sharp from 'sharp';
import { COVER_SIZES } from './sizes.js';

export interface StoredCover {
  body: Buffer;
  etag: string;
}

/** Covers on disk (`/data/covers`): one folder per key with s/m/l WebP plus the original. */
export class CoverStore {
  constructor(private readonly dir: string) {}

  private folder(key: string): string {
    // Keys contain ':' and provider ids; hash them into safe, flat folder names.
    return join(this.dir, createHash('sha256').update(key).digest('hex').slice(0, 32));
  }

  async read(key: string, size: CoverSize): Promise<StoredCover | null> {
    try {
      const body = await readFile(join(this.folder(key), `${size}.webp`));
      return { body, etag: etagOf(body) };
    } catch {
      return null;
    }
  }

  /** The image as downloaded, for handing to CWA on import. */
  async original(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.folder(key), 'original'));
    } catch {
      return null;
    }
  }

  /** Resizes to every size and writes atomically. Throws if the bytes are not an image. */
  async write(key: string, source: Buffer): Promise<void> {
    const folder = this.folder(key);
    await mkdir(folder, { recursive: true, mode: 0o755 });
    const files: [string, Buffer][] = [['original', source]];
    for (const [size, box] of Object.entries(COVER_SIZES)) {
      files.push([`${size}.webp`, await toWebp(source, box)]);
    }
    for (const [name, body] of files) {
      const tmp = join(folder, `.${name}.tmp`);
      await writeFile(tmp, body, { mode: 0o644 });
      await rename(tmp, join(folder, name));
    }
  }
}

export function toWebp(source: Buffer, box: { width: number; height: number }): Promise<Buffer> {
  return sharp(source, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ ...box, fit: 'cover', position: 'attention' })
    .webp({ quality: 80 })
    .toBuffer();
}

export function etagOf(body: Buffer): string {
  return `"${createHash('sha1').update(body).digest('base64url')}"`;
}
