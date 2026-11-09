import { endpoints } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import type { RecommendService } from './service.js';

export interface RecommendRoutesOptions {
  recommend: RecommendService;
  requireAuth: PreHandler;
}

function userIdOf(request: { userId?: string }): string {
  if (!request.userId) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
  return request.userId;
}

/** For you (BRK-11). Free: none of these may spend an indexer search. */
export const recommendRoutes: FastifyPluginAsyncZod<RecommendRoutesOptions> = async (app, opts) => {
  const { recommendations, dismissRecommendation, undoDismissRecommendation } = endpoints;
  const { recommend, requireAuth } = opts;

  app.get(
    recommendations.path,
    { preHandler: requireAuth, schema: { response: { 200: recommendations.response } } },
    async (request) => recommend.get(userIdOf(request)),
  );

  app.post(
    dismissRecommendation.path,
    {
      preHandler: requireAuth,
      schema: {
        params: dismissRecommendation.params,
        body: dismissRecommendation.body,
        response: { 200: dismissRecommendation.response },
      },
    },
    async (request) =>
      recommend.dismiss(userIdOf(request), request.params.workId, request.body.kind),
  );

  app.delete(
    undoDismissRecommendation.path,
    {
      preHandler: requireAuth,
      schema: {
        params: undoDismissRecommendation.params,
        response: { 200: undoDismissRecommendation.response },
      },
    },
    async (request) => recommend.undoDismiss(userIdOf(request), request.params.workId),
  );
};
