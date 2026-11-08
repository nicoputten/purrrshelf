import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/cli.js';
import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import { UserRepository } from '../src/modules/auth/users.js';
import { verifyPassword } from '../src/modules/auth/passwords.js';
import { PASSWORD, TestClock } from './helpers.js';

function harness(password = PASSWORD) {
  const handle = openDatabase(':memory:');
  // Keep the in-memory database alive across CLI runs.
  const shared: DatabaseHandle = { ...handle, close: () => {} };
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = {
    env: { DATABASE_PATH: ':memory:' },
    readPassword: async () => password,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    openDatabase: () => shared,
  };
  const users = new UserRepository(handle.db, new TestClock().fn);
  return { io, out, err, users };
}

describe('purrshelf CLI', () => {
  it('adds a user and lists it', async () => {
    const h = harness();
    expect(
      await runCli(['user', 'add', 'reader', '--name', 'Reader One', '--locale', 'nl'], h.io),
    ).toBe(0);
    expect(h.out).toEqual(['Created user reader']);
    expect(h.users.findByUsername('reader')).toMatchObject({
      displayName: 'Reader One',
      locale: 'nl',
    });

    expect(await runCli(['user', 'list'], h.io)).toBe(0);
    expect(h.out[1]).toBe('reader\tReader One\tnl');
  });

  it('sets a password', async () => {
    const h = harness();
    await runCli(['user', 'add', 'reader', '--name', 'R'], h.io);
    const h2 = { ...h.io, readPassword: async () => 'a brand new password' };
    expect(await runCli(['user', 'set-password', 'Reader'], h2)).toBe(0);
    expect(h.out.at(-1)).toBe('Password updated for reader');
    expect(
      await verifyPassword(h.users.findByUsername('reader')!.passwordHash, 'a brand new password'),
    ).toBe(true);
  });

  it('reports user errors with exit code 1', async () => {
    const h = harness('short');
    expect(await runCli(['user', 'add', 'reader', '--name', 'R'], h.io)).toBe(1);
    expect(h.err[0]).toMatch(/at least 10/);
  });

  it.each([
    [[]],
    [['user']],
    [['user', 'add', 'reader']],
    [['user', 'set-password']],
    [['user', 'explode']],
    [['user', 'add', 'reader', '--name', 'R', '--locale', 'de']],
    [['user', 'list', '--unknown']],
  ])('prints usage with exit code 2 for %j', async (argv) => {
    const h = harness();
    expect(await runCli(argv, h.io)).toBe(2);
    expect(h.err.join('\n')).toMatch(/Usage|locale/);
  });

  it('adds, updates, lists and removes an indexer', async () => {
    const h = harness();
    const add = [
      'indexer',
      'add',
      'primary',
      '--name',
      'Primary',
      '--url',
      'https://indexer.example.invalid',
    ];
    expect(await runCli([...add, '--search-limit', '25', '--grab-limit', '20'], h.io)).toBe(0);
    expect(h.out.at(-1)).toBe(
      'Saved indexer primary; set INDEXER_PRIMARY_API_KEY in the environment',
    );
    expect(
      await runCli([...add, '--search-limit', '10', '--grab-limit', '5', '--priority=-1'], h.io),
    ).toBe(0);

    expect(await runCli(['indexer', 'list'], h.io)).toBe(0);
    expect(h.out.at(-1)).toBe(
      'primary\tPrimary\tpriority -1\t10 searches/h\t5 grabs/h\tINDEXER_PRIMARY_API_KEY missing',
    );
    const withKey = { ...h.io, env: { ...h.io.env, INDEXER_PRIMARY_API_KEY: 'fake' } };
    await runCli(['indexer', 'list'], withKey);
    expect(h.out.at(-1)).toMatch(/\tkey set$/);

    expect(await runCli(['indexer', 'remove', 'primary'], h.io)).toBe(0);
    expect(h.out.at(-1)).toBe('Removed indexer primary');
    expect(await runCli(['indexer', 'remove', 'primary'], h.io)).toBe(1);
    expect(h.err.at(-1)).toBe('No indexer "primary"');
  });

  it.each([
    [['--search-limit', 'many', '--grab-limit', '1'], /limit/],
    [['--search-limit', '1', '--grab-limit', '1', '--priority', 'first'], /Priority/],
  ])('reports invalid indexer values with exit code 1: %j', async (flags, message) => {
    const h = harness();
    const argv = [
      'indexer',
      'add',
      'primary',
      '--name',
      'P',
      '--url',
      'https://indexer.example.invalid',
    ];
    expect(await runCli([...argv, ...flags], h.io)).toBe(1);
    expect(h.err.at(-1)).toMatch(message);
  });

  it.each([
    [['indexer']],
    [['indexer', 'add', 'primary', '--name', 'P']],
    [['indexer', 'remove']],
    [['indexer', 'explode']],
  ])('prints usage with exit code 2 for %j', async (argv) => {
    const h = harness();
    expect(await runCli(argv, h.io)).toBe(2);
    expect(h.err.join('\n')).toMatch(/Usage/);
  });

  it('rethrows unexpected indexer errors', async () => {
    const h = harness();
    const io = {
      ...h.io,
      openDatabase: () => ({ ...h.io.openDatabase(':memory:'), db: undefined as never }),
    };
    await expect(runCli(['indexer', 'list'], io)).rejects.toThrow();
  });

  it('prints help with exit code 0', async () => {
    const h = harness();
    expect(await runCli(['--help'], h.io)).toBe(0);
    expect(h.out[0]).toMatch(/^Usage/);
  });

  it('defaults to the /data database path', async () => {
    const h = harness();
    let opened = '';
    const io = {
      ...h.io,
      env: {},
      openDatabase: (p: string) => ((opened = p), h.io.openDatabase(p)),
    };
    await runCli(['user', 'list'], io);
    expect(opened).toBe('/data/purrshelf.db');
  });

  it('rethrows unexpected errors', async () => {
    const h = harness();
    const io = { ...h.io, readPassword: async () => Promise.reject(new Error('stdin closed')) };
    await expect(runCli(['user', 'add', 'reader', '--name', 'R'], io)).rejects.toThrow(
      'stdin closed',
    );
  });
});
