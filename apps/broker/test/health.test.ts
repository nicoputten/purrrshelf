import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const config = loadConfig({ LOG_LEVEL: 'silent' });

describe('GET /api/v1/health', () => {
  it('answers ok with no checks registered', async () => {
    app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: [] });
    expect(typeof res.json().version).toBe('string');
  });

  it('reports degraded with the failing check, but still answers 200', async () => {
    app = await buildApp({
      config,
      healthChecks: [
        { name: 'good', check: async () => {} },
        {
          name: 'bad',
          check: async () => {
            throw new Error('unreachable');
          },
        },
        {
          name: 'weird',
          check: () => Promise.reject('plain string'),
        },
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'degraded',
      checks: [
        { name: 'good', status: 'ok' },
        { name: 'bad', status: 'fail', error: 'unreachable' },
        { name: 'weird', status: 'fail', error: 'plain string' },
      ],
    });
  });
});
