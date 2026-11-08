import { afterEach, describe, expect, it } from 'vitest';
import { makeTestApp, type TestContext } from './helpers.js';

// Documentation-range addresses (RFC 5737); 172.18.0.2 stands in for the
// proxy container on a Docker network.
const PROXY = '172.18.0.2';
const CLIENT_A = '198.51.100.7';
const CLIENT_B = '203.0.113.9';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

async function setup(config: Record<string, string> = {}) {
  ctx = await makeTestApp({ config: { LOGIN_RATE_LIMIT_PER_MINUTE: '2', ...config } });
  return ctx.app;
}

function badLogin(remoteAddress: string, forwardedFor?: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    payload: { username: 'nobody', password: 'x' },
  });
}

describe('client IP behind the proxy (ADR 0018)', () => {
  it('rate limits each real client separately when they come through the proxy', async () => {
    await setup();
    for (let i = 0; i < 2; i++) expect((await badLogin(PROXY, CLIENT_A)).statusCode).toBe(401);
    expect((await badLogin(PROXY, CLIENT_A)).statusCode).toBe(429);
    expect((await badLogin(PROXY, CLIENT_B)).statusCode).toBe(401);
  });

  it('ignores a forged X-Forwarded-For that the proxy passed along', async () => {
    await setup();
    // The proxy appends the real peer; whatever the client put in front is not trusted.
    for (let i = 0; i < 2; i++) await badLogin(PROXY, `10.0.0.${i}, ${CLIENT_A}`);
    expect((await badLogin(PROXY, `10.0.0.99, ${CLIENT_A}`)).statusCode).toBe(429);
  });

  it('ignores X-Forwarded-For from a peer that is not a trusted proxy', async () => {
    await setup();
    for (let i = 0; i < 2; i++) await badLogin(CLIENT_A, `192.0.2.${i}`);
    expect((await badLogin(CLIENT_A, '192.0.2.99')).statusCode).toBe(429);
  });

  it('trusts no proxy at all with TRUST_PROXY=none', async () => {
    await setup({ TRUST_PROXY: 'none' });
    for (let i = 0; i < 2; i++) await badLogin(PROXY, `198.51.100.${i}`);
    expect((await badLogin(PROXY, CLIENT_B)).statusCode).toBe(429);
  });
});
