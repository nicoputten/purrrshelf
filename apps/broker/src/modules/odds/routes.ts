import { endpoints } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import type { OddsService } from './service.js';

export interface OddsRoutesOptions {
  odds: OddsService;
  requireAuth: PreHandler;
}

function userIdOf(request: { userId?: string }): string {
  if (!request.userId) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
  return request.userId;
}

/** Before Add (BRK-13). Free: never spends an indexer search. */
export const oddsRoutes: FastifyPluginAsyncZod<OddsRoutesOptions> = async (app, opts) => {
  const { requestPreview } = endpoints;
  app.get(
    requestPreview.path,
    {
      preHandler: opts.requireAuth,
      schema: { querystring: requestPreview.query, response: { 200: requestPreview.response } },
    },
    async (request) => opts.odds.preview(userIdOf(request), request.query),
  );
};
