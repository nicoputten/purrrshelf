import type { FastifyBaseLogger } from 'fastify';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import type { User } from '../../db/schema.js';
import { MetadataCache } from '../discover/cache.js';
import type { FetchLike } from '../discover/http.js';
import type { LibraryLookup } from '../discover/library-lookup.js';
import type { DiscoverService } from '../discover/service.js';
import { openRequests } from '../recommend/open-requests.js';
import { fetchAppleChart } from './apple.js';
import { ChartService } from './service.js';

/** The last good chart is kept this long, for when a source is down. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function createCharts(opts: {
  db: Db;
  clock: Clock;
  fetch: FetchLike;
  timeoutMs: number;
  users: { findById(id: string): User | undefined };
  discover: DiscoverService;
  hasTrending: boolean;
  library: LibraryLookup;
  log: FastifyBaseLogger;
}): ChartService {
  const { discover } = opts;
  return new ChartService({
    users: opts.users,
    apple: (region) => fetchAppleChart({ fetch: opts.fetch, timeoutMs: opts.timeoutMs }, region),
    works: {
      matchWork: (book) => discover.matchWork(book),
      summary: (id) => discover.summary(id),
      trending: (limit) => discover.trending(limit),
      hasTrending: opts.hasTrending,
    },
    library: opts.library,
    openRequests: openRequests(opts.db),
    cache: new MetadataCache(opts.db, opts.clock, KEEP_MS),
    clock: opts.clock,
    log: opts.log,
  });
}
