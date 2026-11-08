import { endpoints, type Readers } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { PreHandler } from '../auth/authenticate.js';
import type { UserRepository } from '../auth/users.js';

export interface ReaderRoutesOptions {
  users: UserRepository;
  requireAuth: PreHandler;
}

/** The readers of this server: who a new book can go to. The asking user comes first. */
export const readerRoutes: FastifyPluginAsyncZod<ReaderRoutesOptions> = async (app, opts) => {
  const { readers } = endpoints;
  app.get(
    readers.path,
    { preHandler: opts.requireAuth, schema: { response: { 200: readers.response } } },
    async (request): Promise<Readers> => ({
      readers: opts.users
        .list()
        .map((u) => ({
          id: u.id,
          displayName: u.displayName,
          me: u.id === request.userId,
          kobo: u.cwaUserId !== null,
        }))
        .sort((a, b) => Number(b.me) - Number(a.me) || a.displayName.localeCompare(b.displayName)),
    }),
  );
};
