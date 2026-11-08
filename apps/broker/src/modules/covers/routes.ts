import { CoverQuery, WorkParams, coverPath } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { PreHandler } from '../auth/authenticate.js';
import type { CoverService } from './service.js';

export interface CoverRoutesOptions {
  covers: CoverService;
  requireAuth: PreHandler;
}

const WEEK = 7 * 24 * 60 * 60;

/** `GET /covers/:id?size=s|m|l` → WebP with an ETag and long cache headers. */
export const coverRoutes: FastifyPluginAsyncZod<CoverRoutesOptions> = async (app, opts) => {
  app.get(
    coverPath,
    { preHandler: opts.requireAuth, schema: { params: WorkParams, querystring: CoverQuery } },
    async (request, reply) => {
      const cover = await opts.covers.get(request.params.id, request.query.size);
      // A real cover rarely changes; a placeholder should be replaced soon after a cover appears.
      const maxAge = cover.kind === 'placeholder' ? 60 * 60 : 30 * 24 * 60 * 60;
      reply
        .header('content-type', 'image/webp')
        .header('etag', cover.etag)
        .header('cache-control', `private, max-age=${maxAge}, stale-while-revalidate=${WEEK}`)
        .header('x-cover-kind', cover.kind);
      if (request.headers['if-none-match'] === cover.etag) return reply.status(304).send();
      return reply.send(cover.body);
    },
  );
};
