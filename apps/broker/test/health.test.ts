import { afterEach, describe, expect, it } from 'vitest';
import { Health } from '@purrshelf/contract';
import { makeTestApp, type TestContext } from './helpers.js';

let ctx: TestContext | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

describe('GET /api/v1/health', () => {
  it('answers ok with the database check and no auth', async () => {
    ctx = await makeTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = Health.parse(res.json());
    expect(body).toMatchObject({
      service: 'purrshelf-broker',
      status: 'ok',
      checks: [{ name: 'database', status: 'ok' }],
    });
  });

  it('reports degraded with the failing check, but still answers 200', async () => {
    ctx = await makeTestApp({
      healthChecks: [
        { name: 'good', check: async () => {} },
        {
          name: 'bad',
          check: async () => {
            throw new Error('unreachable');
          },
        },
        { name: 'weird', check: () => Promise.reject('plain string') },
      ],
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'degraded',
      checks: [
        { name: 'database', status: 'ok' },
        { name: 'good', status: 'ok' },
        { name: 'bad', status: 'fail', error: 'unreachable' },
        { name: 'weird', status: 'fail', error: 'plain string' },
      ],
    });
  });

  it('fails the database check once the database is closed', async () => {
    ctx = await makeTestApp();
    ctx.database.close();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.json().checks[0]).toMatchObject({ name: 'database', status: 'fail' });
    await ctx.app.close();
    ctx = undefined;
  });
});
