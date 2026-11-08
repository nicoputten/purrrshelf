import type { Clock } from '../../clock.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/index.js';
import type { FastifyBaseLogger } from 'fastify';
import { MetadataCache } from './cache.js';
import type { FetchLike } from './http.js';
import type { LibraryLookup } from './library-lookup.js';
import { GoogleBooksProvider } from './providers/googlebooks.js';
import { HardcoverProvider } from './providers/hardcover.js';
import { OpenLibraryProvider } from './providers/openlibrary.js';
import { DiscoverService } from './service.js';
import type { MetadataProvider } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The three providers in priority order (ADR 0007). */
export function defaultProviders(config: Config, fetch: FetchLike): MetadataProvider[] {
  const http = { fetch, timeoutMs: config.METADATA_TIMEOUT_MS };
  return [
    new HardcoverProvider(http, config.HARDCOVER_API_TOKEN),
    new OpenLibraryProvider(http),
    new GoogleBooksProvider(http, config.GOOGLE_BOOKS_API_KEY),
  ];
}

export function createDiscover(opts: {
  config: Config;
  db: Db;
  clock: Clock;
  providers: MetadataProvider[];
  library: LibraryLookup;
  log: FastifyBaseLogger;
}): DiscoverService {
  return new DiscoverService({
    providers: opts.providers,
    cache: new MetadataCache(opts.db, opts.clock, opts.config.METADATA_CACHE_DAYS * DAY_MS),
    library: opts.library,
    log: opts.log,
  });
}
