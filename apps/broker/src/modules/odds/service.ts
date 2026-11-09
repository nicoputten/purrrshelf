import type { RequestPreview, RequestPreviewQuery } from '@purrshelf/contract';
import type { Clock } from '../../clock.js';
import { flatten, type MergedWork } from '../discover/merge.js';
import { lowOdds } from './decide.js';
import type { LastNotFound } from './not-found.js';

/** The slice of the discover service the preview needs: metadata only. */
export interface OddsWorks {
  /** Throws NOT_FOUND / METADATA_UNAVAILABLE like GET /works/:id. */
  getWork(userId: string, id: string): Promise<{ library: unknown }>;
  workGroup(id: string): Promise<MergedWork>;
}

export interface OddsDeps {
  works: OddsWorks;
  lastNotFound: LastNotFound;
  clock: Clock;
}

/**
 * The Add sheet's preview (BRK-13, ADR 0041). Uses cached metadata and the
 * requests table only: nothing here may reach an indexer; a test enforces it.
 */
export class OddsService {
  constructor(private readonly deps: OddsDeps) {}

  async preview(
    userId: string,
    { workId, language }: RequestPreviewQuery,
  ): Promise<RequestPreview> {
    const work = await this.deps.works.getWork(userId, workId);
    // Add only records ownership for a book the library has: nothing to warn about.
    if (work.library) return { workId, language, lowOdds: null };
    const flat = flatten(await this.deps.works.workGroup(workId));
    const facts = {
      workId,
      language,
      isbns: flat.isbns,
      releaseDate: flat.releaseDate ?? null,
      publishedYear: flat.publishedYear,
      workLanguage: flat.language,
      languages: flat.languages ?? [],
      readers: flat.readers ?? null,
      lastNotFoundAt: this.deps.lastNotFound(workId),
    };
    return { workId, language, lowOdds: lowOdds(facts, this.deps.clock()) };
  }
}
