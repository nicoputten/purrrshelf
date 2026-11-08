import { eq, lt } from 'drizzle-orm';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { metadataCache } from '../../db/schema.js';

/** Key/value cache for provider replies, persisted in SQLite so it survives restarts. */
export class MetadataCache {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ttlMs: number,
  ) {}

  get<T>(key: string): T | undefined {
    const row = this.db.select().from(metadataCache).where(eq(metadataCache.key, key)).get();
    if (!row || row.expiresAt <= this.clock()) return undefined;
    return JSON.parse(row.value) as T;
  }

  set(key: string, value: unknown): void {
    const now = this.clock();
    const row = {
      key,
      value: JSON.stringify(value),
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
    this.db.transaction((tx) => {
      tx.delete(metadataCache).where(lt(metadataCache.expiresAt, now)).run();
      tx.insert(metadataCache)
        .values(row)
        .onConflictDoUpdate({
          target: metadataCache.key,
          set: { value: row.value, expiresAt: row.expiresAt },
        })
        .run();
    });
  }

  /** Returns the cached value, or computes, stores and returns it. `null` results are not stored. */
  async getOrSet<T>(key: string, compute: () => Promise<T | null>): Promise<T | null> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const value = await compute();
    if (value !== null) this.set(key, value);
    return value;
  }
}
