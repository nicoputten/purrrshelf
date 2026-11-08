import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/cli.js';
import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import { UserRepository } from '../src/modules/auth/users.js';
import { verifyPassword } from '../src/modules/auth/passwords.js';
import { PASSWORD, TestClock } from './helpers.js';
import { FakeNewznab, fixture } from './fake-newznab.js';
import { FakeCwa } from './library/fake-cwa.js';

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
      'primary\tPrimary\tpriority -1\t10 searches/day\t5 grabs/day\tINDEXER_PRIMARY_API_KEY missing',
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

  it('reads caps through the budget', async () => {
    const h = harness();
    const fake = new FakeNewznab().on('caps', { body: fixture('caps.xml') });
    const io = {
      ...h.io,
      env: { ...h.io.env, INDEXER_PRIMARY_API_KEY: 'fake' },
      fetch: fake.fetch,
    };
    const add = [
      'indexer',
      'add',
      'primary',
      '--name',
      'P',
      '--url',
      'https://indexer.example.invalid',
    ];
    await runCli([...add, '--search-limit', '1', '--grab-limit', '1'], io);
    expect(await runCli(['indexer', 'caps', 'primary'], io)).toBe(0);
    expect(h.out.at(-1)).toBe('primary: book search with q, title, author');
    // The one search of today is spent: a second read is refused without calling out.
    expect(await runCli(['indexer', 'caps', 'primary'], io)).toBe(1);
    expect(h.err.at(-1)).toMatch(/No search budget left/);
    expect(fake.calls).toHaveLength(1);
  });

  it.each([
    [
      '<caps><searching><book-search available="no"/></searching></caps>',
      'no book search; free-text search only',
    ],
    [
      '<caps><searching><book-search available="yes"/></searching></caps>',
      'book search with no parameters',
    ],
  ])('describes caps %#', async (body, line) => {
    const h = harness();
    const fake = new FakeNewznab().on('caps', { body });
    const io = {
      ...h.io,
      env: { ...h.io.env, INDEXER_PRIMARY_API_KEY: 'fake' },
      fetch: fake.fetch,
    };
    const add = [
      'indexer',
      'add',
      'primary',
      '--name',
      'P',
      '--url',
      'https://indexer.example.invalid',
    ];
    await runCli([...add, '--search-limit', '5', '--grab-limit', '1'], io);
    await runCli(['indexer', 'caps', 'primary'], io);
    expect(h.out.at(-1)).toBe(`primary: ${line}`);
  });

  it('reports caps problems with exit code 1', async () => {
    const h = harness();
    const add = [
      'indexer',
      'add',
      'primary',
      '--name',
      'P',
      '--url',
      'https://indexer.example.invalid',
    ];
    await runCli([...add, '--search-limit', '5', '--grab-limit', '1'], h.io);
    expect(await runCli(['indexer', 'caps', 'nope'], h.io)).toBe(1);
    expect(h.err.at(-1)).toBe('No indexer "nope"');
    expect(await runCli(['indexer', 'caps', 'primary'], h.io)).toBe(1);
    expect(h.err.at(-1)).toBe('Set INDEXER_PRIMARY_API_KEY in the broker environment');
    const withKey = { ...h.io, env: { INDEXER_PRIMARY_API_KEY: 'k' } };
    for (const body of [fixture('error-key.xml'), fixture('error-limit.xml')]) {
      const fake = new FakeNewznab().on('caps', { body });
      expect(await runCli(['indexer', 'caps', 'primary'], { ...withKey, fetch: fake.fetch })).toBe(
        1,
      );
    }
    expect(h.err.at(-2)).toMatch(/Incorrect user credentials/);
    expect(h.err.at(-1)).toBe('Request limit reached');
    expect(await runCli(['indexer', 'caps'], h.io)).toBe(2);
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

describe('purrshelf user link-cwa', () => {
  async function setup() {
    const cwa = new FakeCwa();
    const h = harness();
    h.io.env.CWA_CONFIG_PATH = cwa.dir;
    await runCli(['user', 'add', 'reader', '--name', 'Reader One'], h.io);
    return { cwa, h };
  }

  it('links a reader to their CWA user and unlinks them', async () => {
    const { cwa, h } = await setup();
    try {
      expect(await runCli(['user', 'link-cwa', 'reader', '--cwa-user', 'Reader-A'], h.io)).toBe(0);
      expect(h.out.at(-1)).toBe('Linked reader to CWA user Reader-A (id 3)');
      expect(h.err).toEqual([]);
      expect(h.users.findByUsername('reader')?.cwaUserId).toBe(3);

      expect(await runCli(['user', 'unlink-cwa', 'reader'], h.io)).toBe(0);
      expect(h.out.at(-1)).toBe('Unlinked reader from CWA');
      expect(h.users.findByUsername('reader')?.cwaUserId).toBeNull();
    } finally {
      cwa.close();
    }
  });

  it('links but warns when the Kobo shelf or sync token is missing', async () => {
    const { cwa, h } = await setup();
    try {
      h.io.env.CWA_KOBO_SHELF_NAME = 'Holiday';
      expect(await runCli(['user', 'link-cwa', 'reader', '--cwa-user', 'no-shelf'], h.io)).toBe(0);
      expect(h.err).toEqual([
        'Warning: no-shelf needs exactly one shelf "Holiday" with Kobo sync on',
        'Warning: no-shelf has not set up Kobo sync in CWA yet',
      ]);
      expect(await runCli(['user', 'link-cwa', 'reader', '--cwa-user', 'reader-a'], h.io)).toBe(0);
      expect(h.err.at(-1)).toMatch(/shelf "Holiday" with Kobo sync on/);
    } finally {
      cwa.close();
    }
  });

  it('fails on an unknown CWA user, an unknown reader or an unreadable app.db', async () => {
    const { cwa, h } = await setup();
    try {
      expect(await runCli(['user', 'link-cwa', 'reader', '--cwa-user', 'nobody'], h.io)).toBe(1);
      expect(h.err.at(-1)).toBe('CWA has no user "nobody"');
      expect(await runCli(['user', 'link-cwa', 'ghost', '--cwa-user', 'reader-a'], h.io)).toBe(1);
      expect(h.err.at(-1)).toBe('No user "ghost"');
      expect(await runCli(['user', 'unlink-cwa', 'ghost'], h.io)).toBe(1);
      h.io.env.CWA_CONFIG_PATH = `${cwa.dir}/missing`;
      expect(await runCli(['user', 'link-cwa', 'reader', '--cwa-user', 'reader-a'], h.io)).toBe(1);
      expect(h.err.at(-1)).toMatch(/^Cannot read CWA's app.db: Cannot open CWA app.db/);
    } finally {
      cwa.close();
    }
  });

  it.each([
    [['user', 'link-cwa', 'reader']],
    [['user', 'link-cwa', '--cwa-user', 'reader-a']],
    [['user', 'unlink-cwa']],
  ])('shows usage for %j', async (argv) => {
    const h = harness();
    expect(await runCli(argv, h.io)).toBe(2);
    expect(h.err[0]).toMatch(/^Usage:/);
  });

  it('reads app.db from /cwa-config by default', async () => {
    const h = harness();
    await runCli(['user', 'add', 'reader', '--name', 'R'], h.io);
    expect(await runCli(['user', 'link-cwa', 'reader', '--cwa-user', 'a'], h.io)).toBe(1);
    expect(h.err.at(-1)).toMatch(/Cannot open CWA app.db/);
  });
});
