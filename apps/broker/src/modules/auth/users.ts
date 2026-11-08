import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Locale } from '@purrshelf/contract';
import type { Clock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { users, type User } from '../../db/schema.js';
import { MIN_PASSWORD_LENGTH, hashPassword } from './passwords.js';

export class UserError extends Error {
  override name = 'UserError';
}

export interface NewUser {
  username: string;
  displayName: string;
  password: string;
  locale?: Locale;
}

const USERNAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UserError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

export class UserRepository {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  findById(id: string): User | undefined {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  findByUsername(username: string): User | undefined {
    return this.db
      .select()
      .from(users)
      .where(eq(users.username, normaliseUsername(username)))
      .get();
  }

  async create(input: NewUser): Promise<User> {
    const username = normaliseUsername(input.username);
    if (!USERNAME.test(username)) {
      throw new UserError('Username may only use letters, digits, dot, dash and underscore');
    }
    if (this.findByUsername(username)) throw new UserError(`User "${username}" already exists`);
    if (!input.displayName.trim()) throw new UserError('Display name is required');
    checkPassword(input.password);

    const row: User = {
      id: randomUUID(),
      username,
      displayName: input.displayName.trim(),
      passwordHash: await hashPassword(input.password),
      locale: input.locale ?? 'en',
      cwaUserId: null,
      koboShelfId: null,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: this.clock(),
    };
    this.db.insert(users).values(row).run();
    return row;
  }

  /** Sets a new password and clears any lockout. */
  async setPassword(username: string, password: string): Promise<void> {
    checkPassword(password);
    const user = this.findByUsername(username);
    if (!user) throw new UserError(`No user "${normaliseUsername(username)}"`);
    this.db
      .update(users)
      .set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, user.id))
      .run();
  }

  recordFailure(user: User, maxFailures: number, lockoutMs: number): void {
    const failures = user.failedLogins + 1;
    const lock = failures >= maxFailures;
    this.db
      .update(users)
      .set({
        failedLogins: lock ? 0 : failures,
        lockedUntil: lock ? new Date(this.clock().getTime() + lockoutMs) : user.lockedUntil,
      })
      .where(eq(users.id, user.id))
      .run();
  }

  clearFailures(user: User): void {
    if (user.failedLogins === 0 && user.lockedUntil === null) return;
    this.db
      .update(users)
      .set({ failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, user.id))
      .run();
  }

  list(): User[] {
    return this.db.select().from(users).all();
  }
}
