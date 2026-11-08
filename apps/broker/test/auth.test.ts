import { afterEach, describe, expect, it } from 'vitest';
import { ErrorResponse, TokenPair } from '@purrshelf/contract';
import { PASSWORD, login, makeTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

const MINUTE = 60_000;

async function setup(config?: Record<string, string>) {
  ctx = await makeTestApp(config ? { config } : {});
  return ctx;
}

describe('POST /api/v1/auth/login', () => {
  it('returns a 15-minute access token and a 30-day refresh token', async () => {
    const { app, clock } = await setup();
    const res = await login(app);
    expect(res.statusCode).toBe(200);
    const tokens = TokenPair.parse(res.json());
    expect(tokens.accessTokenExpiresIn).toBe(900);
    expect(new Date(tokens.refreshTokenExpiresAt).getTime() - clock.now.getTime()).toBe(
      30 * 24 * 60 * MINUTE,
    );
  });

  it('accepts the username in any case and with spaces', async () => {
    const { app } = await setup();
    expect((await login(app, '  READER ')).statusCode).toBe(200);
  });

  it.each([
    ['wrong password', 'reader', 'nope'],
    ['unknown user', 'nobody', PASSWORD],
  ])('answers INVALID_CREDENTIALS for a %s', async (_label, username, password) => {
    const { app } = await setup();
    const res = await login(app, username, password);
    expect(res.statusCode).toBe(401);
    expect(ErrorResponse.parse(res.json()).code).toBe('INVALID_CREDENTIALS');
  });

  it('answers VALIDATION_ERROR for a malformed body', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(Array.isArray(res.json().details)).toBe(true);
  });

  it('answers VALIDATION_ERROR for invalid JSON', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('locks the account after 5 failures, for 15 minutes', async () => {
    const { app, clock } = await setup();
    for (let i = 0; i < 4; i++) expect((await login(app, 'reader', 'bad')).statusCode).toBe(401);

    const fifth = await login(app, 'reader', 'bad');
    expect(fifth.statusCode).toBe(423);
    expect(fifth.json()).toMatchObject({
      code: 'ACCOUNT_LOCKED',
      details: { retryAfterSeconds: 900 },
    });

    // Even the right password is refused while locked.
    clock.advance(14 * MINUTE);
    const locked = await login(app);
    expect(locked.statusCode).toBe(423);
    expect(locked.json().details.retryAfterSeconds).toBe(60);

    clock.advance(MINUTE);
    expect((await login(app)).statusCode).toBe(200);
  });

  it('starts counting again after the lock has run out', async () => {
    const { app, clock } = await setup();
    for (let i = 0; i < 5; i++) await login(app, 'reader', 'bad');
    clock.advance(15 * MINUTE);
    expect((await login(app, 'reader', 'bad')).statusCode).toBe(401);
    expect((await login(app)).statusCode).toBe(200);
  });

  it('resets the failure count after a successful login', async () => {
    const { app } = await setup();
    for (let i = 0; i < 4; i++) await login(app, 'reader', 'bad');
    expect((await login(app)).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(app, 'reader', 'bad')).statusCode).toBe(401);
  });

  it('rate limits login attempts per client', async () => {
    const { app } = await setup({ LOGIN_RATE_LIMIT_PER_MINUTE: '3' });
    for (let i = 0; i < 3; i++) await login(app, 'nobody', 'x');
    const res = await login(app, 'nobody', 'x');
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('POST /api/v1/auth/refresh', () => {
  async function refresh(token: string) {
    return ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: token },
    });
  }

  it('rotates the refresh token', async () => {
    const { app } = await setup();
    const first = TokenPair.parse((await login(app)).json());
    const res = await refresh(first.refreshToken);
    expect(res.statusCode).toBe(200);
    const second = TokenPair.parse(res.json());
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await refresh(second.refreshToken)).statusCode).toBe(200);
  });

  it('revokes the whole session when a rotated token is reused', async () => {
    const { app } = await setup();
    const first = TokenPair.parse((await login(app)).json());
    const second = TokenPair.parse((await refresh(first.refreshToken)).json());

    const reuse = await refresh(first.refreshToken);
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    // The legitimate newer token is now dead too.
    expect((await refresh(second.refreshToken)).statusCode).toBe(401);
  });

  it('refuses an expired refresh token', async () => {
    const { app, clock } = await setup();
    const tokens = TokenPair.parse((await login(app)).json());
    clock.advance(30 * 24 * 60 * MINUTE);
    expect((await refresh(tokens.refreshToken)).statusCode).toBe(401);
  });

  it('refuses an unknown refresh token', async () => {
    await setup();
    expect((await refresh('made-up')).json()).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('keeps other sessions alive when one is revoked', async () => {
    const { app } = await setup();
    const phone = TokenPair.parse((await login(app)).json());
    const other = TokenPair.parse((await login(app)).json());
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: phone.refreshToken },
    });
    expect((await refresh(phone.refreshToken)).statusCode).toBe(401);
    expect((await refresh(other.refreshToken)).statusCode).toBe(200);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token and ignores unknown ones', async () => {
    const { app } = await setup();
    const tokens = TokenPair.parse((await login(app)).json());
    const out = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({});
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: 'unknown' },
    });
    expect(again.statusCode).toBe(200);
  });
});
