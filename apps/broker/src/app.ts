import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { healthRoutes, type HealthCheck } from './modules/health/routes.js';

export interface AppDeps {
  config: Config;
  healthChecks?: HealthCheck[];
}

export async function buildApp({ config, healthChecks = [] }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Never log credentials or tokens.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  await app.register(healthRoutes, { prefix: '/api/v1', checks: healthChecks });

  return app;
}
