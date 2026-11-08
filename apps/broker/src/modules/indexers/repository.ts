import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { indexers, type Indexer } from '../../db/schema.js';

export class IndexerError extends Error {
  override name = 'IndexerError';
}

const limit = z
  .number({ error: 'limit must be a whole number' })
  .int('limit must be a whole number')
  .min(0, 'limit must be 0 or more');

const IndexerInput = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_]{1,32}$/, 'id may only use a-z, 0-9 and _ (it names INDEXER_<ID>_API_KEY)'),
  name: z.string().trim().min(1, 'Name is required'),
  url: z
    .url({ protocol: /^https?$/, error: 'URL must be an http(s) URL' })
    .transform((u) => u.replace(/\/+$/, '')),
  priority: z
    .number({ error: 'Priority must be a whole number' })
    .int('Priority must be a whole number'),
  searchLimitPerHour: limit,
  grabLimitPerHour: limit,
});
export type IndexerInput = z.input<typeof IndexerInput>;

/** Indexer URLs and limits. Keys come from env only, see {@link IndexerRepository.apiKeyEnvName}. */
export class IndexerRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  static apiKeyEnvName(id: string): string {
    return `INDEXER_${id.toUpperCase()}_API_KEY`;
  }

  get(id: string): Indexer | undefined {
    return this.db.select().from(indexers).where(eq(indexers.id, id)).get();
  }

  /** Priority order: the order in which indexers are queried. */
  list(): Indexer[] {
    return this.db.select().from(indexers).orderBy(asc(indexers.priority), asc(indexers.id)).all();
  }

  upsert(input: IndexerInput): Indexer {
    const parsed = IndexerInput.safeParse(input);
    if (!parsed.success) {
      throw new IndexerError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const values = parsed.data;
    return this.db
      .insert(indexers)
      .values({ ...values, capsJson: null, createdAt: this.clock() })
      .onConflictDoUpdate({ target: indexers.id, set: values })
      .returning()
      .get();
  }

  setCaps(id: string, capsJson: string): void {
    this.db.update(indexers).set({ capsJson }).where(eq(indexers.id, id)).run();
  }

  remove(id: string): boolean {
    return this.db.delete(indexers).where(eq(indexers.id, id)).run().changes > 0;
  }
}
