import type { ErrorCode, ErrorResponse } from '@purrshelf/contract';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/** An error with a stable code from the contract, turned into `{ code, message, details? }`. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    let body: ErrorResponse;
    let status: number;

    if (err instanceof AppError) {
      status = err.statusCode;
      body = { code: err.code, message: err.message };
      if (err.details !== undefined) body.details = err.details;
    } else if (hasZodFastifySchemaValidationErrors(err)) {
      status = 400;
      body = {
        code: 'VALIDATION_ERROR',
        message: 'The request is not valid',
        details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
      };
    } else if (err.statusCode === 429) {
      status = 429;
      body = { code: 'RATE_LIMITED', message: 'Too many requests, try again later' };
    } else if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      // Malformed JSON, wrong content type and similar client errors from Fastify itself.
      status = err.statusCode;
      body = { code: 'VALIDATION_ERROR', message: err.message };
    } else {
      request.log.error({ err }, 'unhandled error');
      status = 500;
      body = { code: 'INTERNAL_ERROR', message: 'Something went wrong' };
    }
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found' } satisfies ErrorResponse),
  );
}
