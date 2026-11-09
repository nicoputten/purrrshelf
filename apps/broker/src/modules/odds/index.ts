import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { lastNotFound } from './not-found.js';
import { OddsService, type OddsWorks } from './service.js';

export function createOdds(opts: { db: Db; clock: Clock; works: OddsWorks }): OddsService {
  return new OddsService({
    works: opts.works,
    lastNotFound: lastNotFound(opts.db),
    clock: opts.clock,
  });
}
