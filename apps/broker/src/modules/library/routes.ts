import { endpoints } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { PreHandler } from '../auth/authenticate.js';
import type { Kobos } from './kobos.js';

export interface LibraryRoutesOptions {
  kobos: Kobos;
  requireAuth: PreHandler;
}

/** Every route here runs behind requireAuth, which sets the user id or answers 401. */
const userIdOf = (request: { userId?: string }): string => request.userId as string;

/** Library books on the readers' Kobos (APP-06). */
export const libraryRoutes: FastifyPluginAsyncZod<LibraryRoutesOptions> = async (app, opts) => {
  const { itemKobos, sendToKobo, removeFromKobo } = endpoints;
  const { kobos, requireAuth } = opts;

  app.get(
    itemKobos.path,
    {
      preHandler: requireAuth,
      schema: { params: itemKobos.params, response: { 200: itemKobos.response } },
    },
    (request) => kobos.list(request.params.itemId, userIdOf(request)),
  );

  app.put(
    sendToKobo.path,
    {
      preHandler: requireAuth,
      schema: { params: sendToKobo.params, response: { 200: sendToKobo.response } },
    },
    (request) => kobos.send(request.params.itemId, request.params.userId, userIdOf(request)),
  );

  app.delete(
    removeFromKobo.path,
    {
      preHandler: requireAuth,
      schema: { params: removeFromKobo.params, response: { 200: removeFromKobo.response } },
    },
    (request) => kobos.remove(request.params.itemId, request.params.userId, userIdOf(request)),
  );
};
