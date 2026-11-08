import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import { UserError, UserRepository } from '../src/modules/auth/users.js';
import { hashPassword, verifyPassword } from '../src/modules/auth/passwords.js';
import { PASSWORD, TestClock } from './helpers.js';

let database: DatabaseHandle;
let users: UserRepository;
beforeEach(() => {
  database = openDatabase(':memory:');
  users = new UserRepository(database.db, new TestClock().fn);
});
afterEach(() => database.close());

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('treats a corrupt hash as a failed check', async () => {
    expect(await verifyPassword('not-a-hash', PASSWORD)).toBe(false);
  });
});

describe('UserRepository', () => {
  it('creates a user with a normalised username and never stores the password', async () => {
    const user = await users.create({
      username: ' Reader ',
      displayName: ' Reader One ',
      password: PASSWORD,
    });
    expect(user).toMatchObject({ username: 'reader', displayName: 'Reader One', locale: 'en' });
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(users.findByUsername('READER')?.id).toBe(user.id);
    expect(users.list()).toHaveLength(1);
  });

  it.each([
    [{ username: 'has space', displayName: 'X', password: PASSWORD }, /Username/],
    [{ username: 'ok', displayName: '  ', password: PASSWORD }, /Display name/],
    [{ username: 'ok', displayName: 'X', password: 'short' }, /at least 10/],
  ])('rejects invalid input %#', async (input, message) => {
    await expect(users.create(input)).rejects.toThrow(message);
  });

  it('rejects a duplicate username', async () => {
    await users.create({ username: 'reader', displayName: 'A', password: PASSWORD });
    await expect(
      users.create({ username: 'READER', displayName: 'B', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UserError);
  });

  it('sets a new password and clears a lockout', async () => {
    const user = await users.create({ username: 'reader', displayName: 'A', password: PASSWORD });
    users.recordFailure(user, 1, 60_000);
    expect(users.findById(user.id)?.lockedUntil).not.toBeNull();

    await users.setPassword('reader', 'another good password');
    const after = users.findById(user.id)!;
    expect(after.lockedUntil).toBeNull();
    expect(await verifyPassword(after.passwordHash, 'another good password')).toBe(true);
  });

  it('refuses to set a password for an unknown user or a short password', async () => {
    await expect(users.setPassword('nobody', PASSWORD)).rejects.toThrow(/No user/);
    await expect(users.setPassword('nobody', 'short')).rejects.toThrow(/at least 10/);
  });
});
