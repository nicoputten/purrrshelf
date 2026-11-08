import { endpoints, type Me } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import type { UserRepository } from '../auth/users.js';

export interface MeRoutesOptions {
  users: UserRepository;
  requireAuth: PreHandler;
}

export const meRoutes: FastifyPluginAsyncZod<MeRoutesOptions> = async (app, opts) => {
  const { me } = endpoints;
  app.get(
    me.path,
    { preHandler: opts.requireAuth, schema: { response: { 200: me.response } } },
    async (request): Promise<Me> => {
      const user = request.userId ? opts.users.findById(request.userId) : undefined;
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        locale: user.locale,
        kobo: { configured: user.koboShelfId !== null },
      };
    },
  );
};
