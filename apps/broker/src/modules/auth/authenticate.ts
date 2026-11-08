import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Clock } from '../../clock.js';
import { AppError } from '../../errors.js';
import type { AccessTokens } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** preHandler that requires a valid bearer access token and sets `request.userId`. */
export function requireAuth(tokens: AccessTokens, clock: Clock): PreHandler {
  return async (request) => {
    const header = request.headers.authorization;
    const match = header?.match(/^Bearer (.+)$/i);
    const claims = match?.[1] ? await tokens.verify(match[1], clock()) : undefined;
    if (!claims) throw new AppError(401, 'UNAUTHORIZED', 'Log in to continue');
    request.userId = claims.userId;
  };
}
