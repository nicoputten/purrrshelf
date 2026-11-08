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
import { createDiscover, defaultProviders } from './modules/discover/index.js';
import { hardcoverTokenCheck } from './modules/discover/hardcover-token.js';
import type { FetchLike } from './modules/discover/http.js';
import { emptyLibrary, type LibraryLookup } from './modules/discover/library-lookup.js';
import { discoverRoutes } from './modules/discover/routes.js';
import type { MetadataProvider } from './modules/discover/types.js';
import { healthRoutes, type HealthCheck } from './modules/health/routes.js';
import { meRoutes } from './modules/me/routes.js';

export interface AppDeps {
  config: Config;
  database: DatabaseHandle;
  clock?: Clock;
  /** Extra dependency checks for /health (CWA, SABnzbd, … in later milestones). */
  healthChecks?: HealthCheck[];
  /** Outbound HTTP for metadata providers; tests pass a fake. */
  fetch?: FetchLike;
  /** Overrides the default Hardcover → Open Library → Google Books providers. */
  metadataProviders?: MetadataProvider[];
  /** Library state for search hits; empty until the library stream provides one. */
  libraryLookup?: LibraryLookup;
}

export async function buildApp({
  config,
  database,
  clock = systemClock,
  healthChecks = [],
  fetch = (input, init) => globalThis.fetch(input, init),
  metadataProviders,
  libraryLookup = emptyLibrary,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Never log credentials or tokens.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: true,
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
  const discover = createDiscover({
    config,
    db: database.db,
    clock,
    providers: metadataProviders ?? defaultProviders(config, fetch),
    library: libraryLookup,
    log: app.log,
  });

  const checks: HealthCheck[] = [{ name: 'database', check: database.ping }, ...healthChecks];
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
      await api.register(discoverRoutes, { discover, requireAuth: authenticated });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
