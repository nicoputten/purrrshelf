import { endpoints } from '@purrshelf/contract';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AuthService } from './service.js';

export interface AuthRoutesOptions {
  auth: AuthService;
  loginRateLimitPerMinute: number;
}

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, opts) => {
  const { login, refresh, logout } = endpoints;

  app.post(
    login.path,
    {
      schema: { body: login.body, response: { 200: login.response } },
      config: { rateLimit: { max: opts.loginRateLimitPerMinute, timeWindow: '1 minute' } },
    },
    async (request) => opts.auth.login(request.body.username, request.body.password),
  );

  app.post(
    refresh.path,
    {
      schema: { body: refresh.body, response: { 200: refresh.response } },
      config: { rateLimit: { max: opts.loginRateLimitPerMinute * 3, timeWindow: '1 minute' } },
    },
    async (request) => opts.auth.refresh(request.body.refreshToken),
  );

  app.post(
    logout.path,
    { schema: { body: logout.body, response: { 200: logout.response } } },
    async (request) => {
      opts.auth.logout(request.body.refreshToken);
      return {};
    },
  );
};
