import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { API_PREFIX } from '@purrshelf/contract';
import { systemClock, type Clock } from './clock.js';
import type { Config } from './config.js';
import type { DatabaseHandle } from './db/index.js';
import { registerErrorHandling } from './errors.js';
import { GitHubReleases, type AppReleaseSource } from './modules/app-updates/github.js';
import { appUpdateRoutes } from './modules/app-updates/routes.js';
import { AppUpdates } from './modules/app-updates/service.js';
import { requireAuth } from './modules/auth/authenticate.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { AccessTokens } from './modules/auth/tokens.js';
import { UserRepository } from './modules/auth/users.js';
import { budgetRoutes } from './modules/budget/routes.js';
import type { FetchLike } from './modules/budget/newznab.js';
import { createDownloads, type Downloads } from './modules/downloads.js';
import type { LibraryLookup } from './modules/search/service.js';
import { noLibraryCovers, type LibraryCovers } from './modules/covers/library-covers.js';
import { coverRoutes } from './modules/covers/routes.js';
import { CoverService } from './modules/covers/service.js';
import { CoverStore } from './modules/covers/store.js';
import { createDiscover, defaultProviders } from './modules/discover/index.js';
import { hardcoverTokenCheck } from './modules/discover/hardcover-token.js';
import type { FetchLike as MetadataFetch } from './modules/discover/http.js';
import {
  emptyLibrary as noLibraryState,
  type LibraryLookup as LibraryStateLookup,
} from './modules/discover/library-lookup.js';
import { discoverRoutes } from './modules/discover/routes.js';
import type { MetadataProvider } from './modules/discover/types.js';
import { healthRoutes, type HealthCheck } from './modules/health/routes.js';
import { LibraryBrowser } from './modules/library/browse.js';
import { CleanupJobs, LibraryCleanup } from './modules/library/cleanup.js';
import { Ownership } from './modules/library/ownership.js';
import { LibraryItems } from './modules/library/items.js';
import { Kobos } from './modules/library/kobos.js';
import { ItemLibraryLookup } from './modules/library/lookup.js';
import { libraryRoutes } from './modules/library/routes.js';
import type { LibraryAdapter } from './modules/library/types.js';
import type { LibraryItems as OwnershipStore } from './modules/requests/delivery.js';
import { SabnzbdClient, type DownloadClient } from './modules/sabnzbd/client.js';
import { readerRoutes } from './modules/readers/routes.js';
import { createRecommend } from './modules/recommend/index.js';
import { recommendRoutes } from './modules/recommend/routes.js';
import { requestRoutes } from './modules/requests/routes.js';
import { requestView } from './modules/requests/view.js';
import { libraryBookLookup } from './modules/search/library-book-lookup.js';
import { meRoutes } from './modules/me/routes.js';

export interface AppDeps {
  config: Config;
  database: DatabaseHandle;
  clock?: Clock;
  /** Extra dependency checks for /health (CWA, SABnzbd, … in later milestones). */
  healthChecks?: HealthCheck[];
  /** Where indexer keys are read (INDEXER_<ID>_API_KEY). */
  env?: NodeJS.ProcessEnv;
  /** "Already in the library?" check before any indexer search; defaults to the library adapter. */
  bookLookup?: LibraryLookup;
  /** SABnzbd; defaults to the one from config (SABNZBD_URL), null without it. */
  sab?: DownloadClient | null;
  /** Tests swap the indexer HTTP client. */
  indexerFetch?: FetchLike;
  /** Outbound HTTP for metadata providers; tests pass a fake. */
  fetch?: MetadataFetch;
  /** Overrides the default Hardcover → Open Library → Google Books providers. */
  metadataProviders?: MetadataProvider[];
  /** Library state for search hits; from library items and CWA by default. */
  libraryLookup?: LibraryStateLookup;
  /** Calibre covers of library books; none until the library stream provides them. */
  libraryCovers?: LibraryCovers;
  /** The library (CWA). Absent when CWA is not configured. */
  library?: LibraryAdapter | null;
  /** Overrides the ownership store finished requests write to (tests). */
  libraryItems?: OwnershipStore;
  /** Where app releases come from; GitHub (APP_RELEASES_REPO) by default. */
  appReleases?: AppReleaseSource;
}

declare module 'fastify' {
  interface FastifyInstance {
    downloads: Downloads;
  }
}

/** Without a library (CWA not configured) nothing is ever "already there". */
const emptyLibrary: LibraryLookup = { findBook: () => Promise.resolve(null) };

export async function buildApp({
  config,
  database,
  clock = systemClock,
  healthChecks = [],
  env = process.env,
  bookLookup,
  sab,
  indexerFetch,
  fetch = (input, init) => globalThis.fetch(input, init),
  metadataProviders,
  libraryLookup,
  libraryCovers = noLibraryCovers,
  library = null,
  libraryItems: ownershipOverride,
  appReleases,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Open event streams (Requests screen) must not hold up a shutdown.
    forceCloseConnections: true,
    logger: {
      level: config.LOG_LEVEL,
      // Never log credentials or tokens.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);
  await app.register(rateLimit, { global: false });

  const users = new UserRepository(database.db, clock);
  const accessTokens = new AccessTokens(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  const auth = new AuthService(
    database.db,
    users,
    accessTokens,
    {
      refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
      maxFailures: config.LOGIN_MAX_FAILURES,
      lockoutMinutes: config.LOGIN_LOCKOUT_MINUTES,
    },
    clock,
  );

  const authenticated = requireAuth(accessTokens, clock);
  const libraryItems = new LibraryItems(database.db, clock);
  const kobos = new Kobos(libraryItems, users, library);
  const ownership = new Ownership(libraryItems, library, (id) => users.findById(id));
  if (library) {
    const cleanup = new CleanupJobs(
      database.db,
      clock,
      new LibraryCleanup(libraryItems, library, app.log),
      app.log,
    );
    app.addHook('onReady', async () => cleanup.start());
    app.addHook('onClose', () => cleanup.stop());
  }
  const libraryBrowser = new LibraryBrowser(libraryItems, library, (id) => users.findById(id));
  const downloadClient =
    sab !== undefined
      ? sab
      : config.SABNZBD_URL && config.SABNZBD_API_KEY
        ? new SabnzbdClient(
            {
              url: config.SABNZBD_URL,
              apiKey: config.SABNZBD_API_KEY,
              category: config.SABNZBD_CATEGORY,
            },
            (url, init) => globalThis.fetch(url, init),
          )
        : null;
  const downloads = createDownloads({
    db: database.db,
    clock,
    env,
    library: bookLookup ?? (library ? libraryBookLookup(library) : emptyLibrary),
    log: app.log,
    sab: downloadClient,
    importLibrary: library,
    shelves: library,
    libraryItems: ownershipOverride ?? libraryItems,
    settings: {
      downloadsPath: config.DOWNLOADS_PATH,
      ingestPath: config.CWA_INGEST_PATH,
      pollIntervalMs: config.DOWNLOAD_POLL_SECONDS * 1000,
      importTimeoutMs: config.IMPORT_TIMEOUT_MINUTES * 60_000,
      maxBookBytes: config.MAX_BOOK_MB * 1024 * 1024,
    },
    ...(indexerFetch ? { fetch: indexerFetch } : {}),
  });
  app.decorate('downloads', downloads);
  app.addHook('onClose', () => downloads.jobs.stop());

  const libraryState =
    libraryLookup ??
    (library
      ? new ItemLibraryLookup(libraryItems, library, (id) => users.findById(id))
      : noLibraryState);
  const discover = createDiscover({
    config,
    db: database.db,
    clock,
    providers: metadataProviders ?? defaultProviders(config, fetch),
    library: libraryState,
    log: app.log,
  });
  const recommend = createRecommend({
    db: database.db,
    clock,
    users,
    items: libraryItems,
    library,
    works: discover,
    matcher: libraryState,
    log: app.log,
  });

  // Also hands the best metadata cover to imports (CoverService.forImport).
  const covers = new CoverService({
    store: new CoverStore(config.COVERS_PATH),
    discover,
    library: libraryCovers,
    http: { fetch, timeoutMs: config.METADATA_TIMEOUT_MS },
    clock,
    log: app.log,
  });

  const releaseSource =
    appReleases ??
    (config.APP_RELEASES_REPO
      ? new GitHubReleases(config.APP_RELEASES_REPO, {
          fetch,
          timeoutMs: config.METADATA_TIMEOUT_MS,
        })
      : null);
  const appUpdates = releaseSource
    ? new AppUpdates({
        source: releaseSource,
        dir: config.APP_UPDATES_PATH,
        fetch,
        clock,
        checkIntervalMs: config.APP_UPDATE_CHECK_MINUTES * 60_000,
        maxBytes: config.MAX_APK_MB * 1024 * 1024,
        log: app.log,
      })
    : null;

  const checks: HealthCheck[] = [
    { name: 'database', check: database.ping },
    ...(library ? [{ name: 'library', check: () => library.ping() }] : []),
    ...(downloadClient ? [{ name: 'sabnzbd', check: () => downloadClient.ping() }] : []),
    ...healthChecks,
  ];
  if (config.HARDCOVER_API_TOKEN) {
    const tokenCheck = hardcoverTokenCheck(
      config.HARDCOVER_API_TOKEN,
      clock,
      config.HARDCOVER_TOKEN_WARN_DAYS,
    );
    checks.push(tokenCheck);
    app.addHook('onReady', async () => {
      try {
        await tokenCheck.check();
      } catch (err) {
        app.log.warn((err as Error).message);
      }
    });
  }

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { checks });
      await api.register(authRoutes, {
        auth,
        loginRateLimitPerMinute: config.LOGIN_RATE_LIMIT_PER_MINUTE,
      });
      await api.register(meRoutes, { users, requireAuth: authenticated });
      await api.register(budgetRoutes, { budget: downloads.budget, requireAuth: authenticated });
      await api.register(discoverRoutes, { discover, requireAuth: authenticated });
      await api.register(readerRoutes, { users, requireAuth: authenticated });
      await api.register(recommendRoutes, { recommend, requireAuth: authenticated });
      await api.register(requestRoutes, {
        requests: downloads.requests,
        releases: downloads.pipeline,
        events: downloads.events,
        view: (row) => requestView(database.db, row),
        works: discover,
        readerIds: () => users.list().map((u) => u.id),
        requireAuth: authenticated,
        log: app.log,
      });
      await api.register(libraryRoutes, {
        kobos,
        ownership,
        browser: libraryBrowser,
        requireAuth: authenticated,
      });
      await api.register(coverRoutes, { covers, requireAuth: authenticated });
      await api.register(appUpdateRoutes, { updates: appUpdates, requireAuth: authenticated });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
