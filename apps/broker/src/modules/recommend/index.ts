import type { FastifyBaseLogger } from 'fastify';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import type { User } from '../../db/schema.js';
import type { LibraryItems } from '../library/items.js';
import type { LibraryAdapter } from '../library/types.js';
import { openRequests } from './open-requests.js';
import { RecommendService } from './service.js';
import { ReaderShelf } from './shelf.js';
import { Dismissals, RowCache } from './store.js';
import type { LibraryMatcher, WorkSource } from './types.js';

export function createRecommend(opts: {
  db: Db;
  clock: Clock;
  users: { findById(id: string): User | undefined; list(): User[] };
  items: LibraryItems;
  library: LibraryAdapter | null;
  works: WorkSource;
  matcher: LibraryMatcher;
  log: FastifyBaseLogger;
}): RecommendService {
  return new RecommendService({
    users: opts.users,
    shelf: new ReaderShelf(opts.items, opts.library),
    works: opts.works,
    library: opts.matcher,
    openRequests: openRequests(opts.db),
    dismissals: new Dismissals(opts.db, opts.clock),
    cache: new RowCache(opts.db),
    clock: opts.clock,
    log: opts.log,
  });
}
