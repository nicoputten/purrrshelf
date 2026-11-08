import type { FastifyPluginAsync } from 'fastify';
import { VERSION } from '../../version.js';

export interface HealthCheck {
  name: string;
  check: () => Promise<void>;
}

export interface HealthRoutesOptions {
  checks: HealthCheck[];
}

type CheckResult = { name: string; status: 'ok' | 'fail'; error?: string };

/**
 * Liveness plus dependency checks. Later milestones register checks for
 * CWA, SABnzbd, indexers and metadata providers; a failing check turns the
 * overall status to "degraded" but the endpoint itself still answers 200 so
 * container restarts are driven by liveness only.
 */
export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, opts) => {
  app.get('/health', async () => {
    const results: CheckResult[] = await Promise.all(
      opts.checks.map(async ({ name, check }): Promise<CheckResult> => {
        try {
          await check();
          return { name, status: 'ok' };
        } catch (err) {
          return { name, status: 'fail', error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
    const status = results.every((r) => r.status === 'ok') ? 'ok' : 'degraded';
    return { status, version: VERSION, checks: results };
  });
};
