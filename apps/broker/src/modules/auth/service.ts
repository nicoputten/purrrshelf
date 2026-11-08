import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { TokenPair } from '@purrshelf/contract';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { refreshTokens, type User } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import { verifyAgainstDummy, verifyPassword } from './passwords.js';
import type { AccessTokens } from './tokens.js';
import { hashToken, newRefreshToken } from './tokens.js';
import type { UserRepository } from './users.js';

export interface AuthSettings {
  refreshTtlDays: number;
  maxFailures: number;
  lockoutMinutes: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
const invalidRefresh = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Session expired, please log in again');

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly users: UserRepository,
    private readonly accessTokens: AccessTokens,
    private readonly settings: AuthSettings,
    private readonly clock: Clock,
  ) {}

  async login(username: string, password: string): Promise<TokenPair> {
    const user = this.users.findByUsername(username);
    if (!user) {
      await verifyAgainstDummy(password);
      throw invalidCredentials();
    }

    const now = this.clock();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw lockedError(user.lockedUntil, now);
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      // A lock that has run out counts as cleared before this failure.
      const fresh = user.lockedUntil ? { ...user, failedLogins: 0, lockedUntil: null } : user;
      this.users.recordFailure(
        fresh,
        this.settings.maxFailures,
        this.settings.lockoutMinutes * 60_000,
      );
      const after = this.users.findById(user.id);
      if (after?.lockedUntil && after.lockedUntil > now) throw lockedError(after.lockedUntil, now);
      throw invalidCredentials();
    }

    this.users.clearFailures(user);
    return this.issue(user, randomUUID());
  }

  async refresh(token: string): Promise<TokenPair> {
    const now = this.clock();
    const row = this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.hash, hashToken(token)))
      .get();
    if (!row) throw invalidRefresh();

    if (row.revokedAt) {
      // A rotated token came back: someone may have stolen it. End the whole session.
      this.revokeFamily(row.familyId, now);
      throw invalidRefresh();
    }
    if (row.expiresAt <= now) throw invalidRefresh();

    const user = this.users.findById(row.userId);
    if (!user) throw invalidRefresh();

    this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .run();
    return this.issue(user, row.familyId);
  }

  /** Revokes the session the token belongs to. Unknown tokens are ignored. */
  logout(token: string): void {
    const row = this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.hash, hashToken(token)))
      .get();
    if (row) this.revokeFamily(row.familyId, this.clock());
  }

  private revokeFamily(familyId: string, now: Date): void {
    this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
      .run();
  }

  private async issue(user: User, familyId: string): Promise<TokenPair> {
    const now = this.clock();
    const refreshToken = newRefreshToken();
    const expiresAt = new Date(now.getTime() + this.settings.refreshTtlDays * DAY_MS);
    this.db
      .insert(refreshTokens)
      .values({
        id: randomUUID(),
        userId: user.id,
        familyId,
        hash: hashToken(refreshToken),
        expiresAt,
        revokedAt: null,
        createdAt: now,
      })
      .run();
    return {
      accessToken: await this.accessTokens.sign(user.id, now),
      accessTokenExpiresIn: this.accessTokens.ttl,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }
}

function lockedError(until: Date, now: Date): AppError {
  return new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts, try again later', {
    retryAfterSeconds: Math.ceil((until.getTime() - now.getTime()) / 1000),
  });
}
