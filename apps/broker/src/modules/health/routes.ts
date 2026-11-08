import { endpoints, type Health } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { VERSION } from '../../version.js';

export interface HealthCheck {
  name: string;
  check: () => Promise<void> | void;
}

export interface HealthRoutesOptions {
  checks: HealthCheck[];
}

type CheckResult = Health['checks'][number];

/**
 * Liveness plus dependency checks. Later milestones register checks for
 * CWA, SABnzbd, indexers and metadata providers. A failing check turns the
 * status to "degraded" but the endpoint still answers 200, so container
 * restarts are driven by liveness only.
 */
export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = async (app, opts) => {
  const { health } = endpoints;
  app.get(health.path, { schema: { response: { 200: health.response } } }, async () => {
    const checks = await Promise.all(
      opts.checks.map(async ({ name, check }): Promise<CheckResult> => {
        try {
          await check();
          return { name, status: 'ok' };
        } catch (err) {
          return { name, status: 'fail', error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
    const status: Health['status'] = checks.every((r) => r.status === 'ok') ? 'ok' : 'degraded';
    return { service: 'purrshelf-broker' as const, status, version: VERSION, checks };
  });
};
