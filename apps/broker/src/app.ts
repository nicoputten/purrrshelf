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
import { requireAuth } from './modules/auth/authenticate.js';
import { authRoutes } from './modules/auth/routes.js';
import { AuthService } from './modules/auth/service.js';
import { AccessTokens } from './modules/auth/tokens.js';
import { UserRepository } from './modules/auth/users.js';
import { budgetRoutes } from './modules/budget/routes.js';
import type { FetchLike } from './modules/budget/newznab.js';
import { createDownloads, type Downloads } from './modules/downloads.js';
import type { LibraryLookup } from './modules/search/service.js';
import { healthRoutes, type HealthCheck } from './modules/health/routes.js';
import { meRoutes } from './modules/me/routes.js';

export interface AppDeps {
  config: Config;
  database: DatabaseHandle;
  clock?: Clock;
  /** Extra dependency checks for /health (CWA, SABnzbd, … in later milestones). */
  healthChecks?: HealthCheck[];
  /** Where indexer keys are read (INDEXER_<ID>_API_KEY). */
  env?: NodeJS.ProcessEnv;
  /** "Already in the library?" check before any indexer search; backed by the library adapter once BRK-03 lands. */
  bookLookup?: LibraryLookup;
  /** Tests swap the indexer HTTP client. */
  indexerFetch?: FetchLike;
}

declare module 'fastify' {
  interface FastifyInstance {
    downloads: Downloads;
  }
}

/** Until the library adapter lands (BRK-03): the library has nothing yet. */
const emptyLibrary: LibraryLookup = { findBook: () => Promise.resolve(null) };

export async function buildApp({
  config,
  database,
  clock = systemClock,
  healthChecks = [],
  env = process.env,
  bookLookup = emptyLibrary,
  indexerFetch,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
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
  const downloads = createDownloads({
    db: database.db,
    clock,
    env,
    library: bookLookup,
    log: app.log,
    ...(indexerFetch ? { fetch: indexerFetch } : {}),
  });
  app.decorate('downloads', downloads);
  app.addHook('onClose', () => downloads.jobs.stop());

  await app.register(
    async (api) => {
      await api.register(healthRoutes, {
        checks: [{ name: 'database', check: database.ping }, ...healthChecks],
      });
      await api.register(authRoutes, {
        auth,
        loginRateLimitPerMinute: config.LOGIN_RATE_LIMIT_PER_MINUTE,
      });
      await api.register(meRoutes, { users, requireAuth: authenticated });
      await api.register(budgetRoutes, { budget: downloads.budget, requireAuth: authenticated });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
