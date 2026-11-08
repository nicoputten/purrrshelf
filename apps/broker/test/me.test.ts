import { afterEach, describe, expect, it } from 'vitest';
import { Me, TokenPair } from '@purrshelf/contract';
import { eq } from 'drizzle-orm';
import { users as usersTable } from '../src/db/schema.js';
import { AccessTokens } from '../src/modules/auth/tokens.js';
import { TEST_SECRET, login, makeTestApp, type TestContext } from './helpers.js';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

async function getMe(token?: string) {
  return ctx.app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/v1/me', () => {
  it('returns the logged-in user', async () => {
    ctx = await makeTestApp();
    const { accessToken } = TokenPair.parse((await login(ctx.app)).json());
    const res = await getMe(accessToken);
    expect(res.statusCode).toBe(200);
    expect(Me.parse(res.json())).toMatchObject({
      username: 'reader',
      displayName: 'Reader One',
      locale: 'nl',
      kobo: { configured: false },
    });
  });

  it('reports a configured Kobo once the user has a shelf', async () => {
    ctx = await makeTestApp();
    ctx.database.db
      .update(usersTable)
      .set({ koboShelfId: 7 })
      .where(eq(usersTable.username, 'reader'))
      .run();
    const { accessToken } = TokenPair.parse((await login(ctx.app)).json());
    expect((await getMe(accessToken)).json().kobo).toEqual({ configured: true });
  });

  it.each([
    ['no token', undefined],
    ['a garbage token', 'not-a-jwt'],
  ])('answers UNAUTHORIZED with %s', async (_label, token) => {
    ctx = await makeTestApp();
    const res = await getMe(token);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('refuses an access token after 15 minutes', async () => {
    ctx = await makeTestApp();
    const { accessToken } = TokenPair.parse((await login(ctx.app)).json());
    ctx.clock.advance(15 * 60_000 + 1000);
    expect((await getMe(accessToken)).statusCode).toBe(401);
  });

  it('refuses a token signed with another secret', async () => {
    ctx = await makeTestApp();
    const user = ctx.users.findByUsername('reader')!;
    const forged = await new AccessTokens('x'.repeat(40), 900).sign(user.id, ctx.clock.now);
    expect((await getMe(forged)).statusCode).toBe(401);
  });

  it('refuses a valid token for a user that no longer exists', async () => {
    ctx = await makeTestApp();
    const token = await new AccessTokens(TEST_SECRET, 900).sign('gone', ctx.clock.now);
    expect((await getMe(token)).statusCode).toBe(401);
  });
});

describe('unknown routes', () => {
  it('answer NOT_FOUND in the error shape', async () => {
    ctx = await makeTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
  });
});
