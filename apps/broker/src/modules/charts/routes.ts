import { endpoints } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import type { ChartService } from './service.js';

export interface ChartRoutesOptions {
  charts: ChartService;
  requireAuth: PreHandler;
}

/** Top 10s (BRK-12). Free: this may never spend an indexer search. */
export const chartRoutes: FastifyPluginAsyncZod<ChartRoutesOptions> = async (app, opts) => {
  const { charts } = endpoints;
  app.get(
    charts.path,
    { preHandler: opts.requireAuth, schema: { response: { 200: charts.response } } },
    async (request) => {
      if (!request.userId) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
      return opts.charts.get(request.userId);
    },
  );
};
