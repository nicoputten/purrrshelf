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
import { IndexerBudget } from './modules/budget/budget.js';
import { budgetRoutes } from './modules/budget/routes.js';
import { healthRoutes, type HealthCheck } from './modules/health/routes.js';
import { meRoutes } from './modules/me/routes.js';

export interface AppDeps {
  config: Config;
  database: DatabaseHandle;
  clock?: Clock;
  /** Extra dependency checks for /health (CWA, SABnzbd, … in later milestones). */
  healthChecks?: HealthCheck[];
}

export async function buildApp({
  config,
  database,
  clock = systemClock,
  healthChecks = [],
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
  const budget = new IndexerBudget(database.db, clock);

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
      await api.register(budgetRoutes, { budget, requireAuth: authenticated });
    },
    { prefix: API_PREFIX },
  );

  return app;
}
