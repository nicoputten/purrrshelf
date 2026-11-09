import { endpoints } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { PreHandler } from '../auth/authenticate.js';
import type { LibraryBrowser } from './browse.js';
import type { Kobos } from './kobos.js';
import type { Ownership } from './ownership.js';

export interface LibraryRoutesOptions {
  kobos: Kobos;
  ownership: Ownership;
  browser: LibraryBrowser;
  requireAuth: PreHandler;
}

/** Every route here runs behind requireAuth, which sets the user id or answers 401. */
const userIdOf = (request: { userId?: string }): string => request.userId as string;

/** The shared library (APP-07) and its books on the readers' Kobos (APP-06). */
export const libraryRoutes: FastifyPluginAsyncZod<LibraryRoutesOptions> = async (app, opts) => {
  const { libraryBooks, keepBook, removeBook, itemKobos, sendToKobo, removeFromKobo } = endpoints;
  const { kobos, ownership, browser, requireAuth } = opts;

  app.put(
    keepBook.path,
    {
      preHandler: requireAuth,
      schema: { params: keepBook.params, response: { 200: keepBook.response } },
    },
    async (request) => ownership.keep(request.params.itemId, userIdOf(request)),
  );

  app.delete(
    removeBook.path,
    {
      preHandler: requireAuth,
      schema: { params: removeBook.params, response: { 200: removeBook.response } },
    },
    (request) => ownership.remove(request.params.itemId, userIdOf(request)),
  );

  app.get(
    libraryBooks.path,
    { preHandler: requireAuth, schema: { response: { 200: libraryBooks.response } } },
    (request) => browser.books(userIdOf(request)),
  );

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
