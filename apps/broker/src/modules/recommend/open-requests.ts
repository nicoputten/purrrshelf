import type { RequestStatus } from '@purrshelf/contract';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { requests } from '../../db/schema.js';
import type { OpenRequests } from './types.js';

/** Statuses after which a request no longer shows on a suggestion. */
const CLOSED: RequestStatus[] = ['in_library', 'pushed', 'cancelled'];

/**
 * The reader's requests that are still open, newest per work: a suggestion
 * the reader already added shows its request status instead of a fresh Add.
 * Reads the requests table only; it never starts or retries anything.
 */
export function openRequests(db: Db): OpenRequests {
  return (userId) => {
    const rows = db
      .select({ id: requests.id, workId: requests.workId, status: requests.status })
      .from(requests)
      .where(and(eq(requests.userId, userId), notInArray(requests.status, CLOSED)))
      .orderBy(asc(requests.createdAt))
      .all();
    return new Map(rows.map((r) => [r.workId, { id: r.id, status: r.status }]));
  };
}
