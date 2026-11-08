import type { BookRequest, PickedRelease } from '@purrshelf/contract';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import {
  indexers,
  releases,
  searchAttempts,
  type ReleaseRow,
  type RequestRow,
} from '../../db/schema.js';
import { detectFormat, detectLanguage } from '../releases/scoring.js';

/** What the app shows of a release: format and language as the scorer reads them. */
export function pickedRelease(row: ReleaseRow): PickedRelease {
  return {
    id: row.id,
    title: row.title,
    format: detectFormat(row.title),
    size: row.size,
    language: detectLanguage(row.title, row.language),
  };
}

/** A request as the API answers it: the row plus what was searched and picked. */
export function requestView(db: Db, row: RequestRow): BookRequest {
  const query = JSON.parse(row.queryJson) as { title: string; authors: string[] };
  const attempts = db
    .select({ cost: searchAttempts.cost, name: indexers.name })
    .from(searchAttempts)
    .innerJoin(indexers, eq(indexers.id, searchAttempts.indexerId))
    .where(eq(searchAttempts.requestId, row.id))
    .orderBy(searchAttempts.id)
    .all();
  const picked = db
    .select()
    .from(releases)
    .where(and(eq(releases.requestId, row.id), eq(releases.status, 'grabbed')))
    .orderBy(desc(releases.createdAt))
    .get();
  return {
    id: row.id,
    workId: row.workId,
    title: query.title,
    authors: query.authors,
    language: row.language,
    mediaType: row.mediaType,
    status: row.status,
    progress: row.progress,
    error: row.error,
    pushTo: JSON.parse(row.pushToJson) as string[],
    searches: attempts.reduce((n, a) => n + a.cost, 0),
    searchedOn: [...new Set(attempts.map((a) => a.name))],
    release: picked ? pickedRelease(picked) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
