import { endpoints } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import type { DiscoverService } from './service.js';

export interface DiscoverRoutesOptions {
  discover: DiscoverService;
  requireAuth: PreHandler;
}

function userIdOf(request: { userId?: string }): string {
  if (!request.userId) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
  return request.userId;
}

/** Free metadata endpoints. None of them may spend an indexer search. */
export const discoverRoutes: FastifyPluginAsyncZod<DiscoverRoutesOptions> = async (app, opts) => {
  const { discoverSearch, work, workSeries, workSimilar } = endpoints;
  const { discover, requireAuth } = opts;

  app.get(
    discoverSearch.path,
    {
      preHandler: requireAuth,
      schema: { querystring: discoverSearch.query, response: { 200: discoverSearch.response } },
    },
    async (request) => discover.search(userIdOf(request), request.query),
  );

  app.get(
    work.path,
    { preHandler: requireAuth, schema: { params: work.params, response: { 200: work.response } } },
    async (request) => discover.getWork(userIdOf(request), request.params.id),
  );

  app.get(
    workSeries.path,
    {
      preHandler: requireAuth,
      schema: { params: workSeries.params, response: { 200: workSeries.response } },
    },
    async (request) => discover.getSeries(userIdOf(request), request.params.id),
  );

  app.get(
    workSimilar.path,
    {
      preHandler: requireAuth,
      schema: { params: workSimilar.params, response: { 200: workSimilar.response } },
    },
    async (request) => discover.getSimilar(userIdOf(request), request.params.id),
  );
};
