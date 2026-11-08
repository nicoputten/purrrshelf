import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { AppError, registerErrorHandling } from '../src/errors.js';

async function appThatThrows(err: unknown) {
  const app = Fastify({ logger: false });
  registerErrorHandling(app);
  app.get('/boom', async () => {
    throw err;
  });
  return app;
}

describe('error handling', () => {
  it('hides unexpected errors behind INTERNAL_ERROR', async () => {
    const app = await appThatThrows(new Error('database password is hunter2'));
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
  });

  it('passes AppError details through', async () => {
    const app = await appThatThrows(new AppError(409, 'VALIDATION_ERROR', 'nope', { field: 'x' }));
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'nope',
      details: { field: 'x' },
    });
  });
});
