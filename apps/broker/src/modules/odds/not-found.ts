import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { requests } from '../../db/schema.js';

/** When the latest request for a work (any reader) ended "not found"; null if none. */
export type LastNotFound = (workId: string) => Date | null;

/** Reads the requests table only; it never starts or retries a search. */
export function lastNotFound(db: Db): LastNotFound {
  return (workId) =>
    db
      .select({ at: requests.updatedAt })
      .from(requests)
      .where(and(eq(requests.workId, workId), eq(requests.status, 'not_found')))
      .orderBy(desc(requests.updatedAt))
      .limit(1)
      .get()?.at ?? null;
}
