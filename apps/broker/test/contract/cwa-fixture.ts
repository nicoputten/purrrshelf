/**
 * Recreates the server's CWA setup (ADR 0017) on the pinned test image:
 *
 * - Kobo sync on, "proxy unknown requests to Kobo Store" on.
 * - Two normal readers, `reader-a` and `reader-b`, with download permission
 *   and "Sync only books in selected shelves with Kobo" on, each with a Kobo
 *   sync token and one private `Kobo` shelf with Kobo sync on. reader-a also
 *   owns another shelf first, so the two Kobo shelf IDs differ from the user
 *   IDs and from each other.
 * - A broker service account that may delete books (ADR 0021).
 * - Two invented EPUBs, dropped into the ingest folder for CWA to import.
 *
 * Passwords meet CWA's policy and are generated per run; they only live in
 * `$CWA_STACK_DIR/fixture.json` (outside the repo).
 *
 * Usage: CWA_STACK_DIR=/tmp/cwa-stack pnpm --filter @purrshelf/broker cwa:fixture
 */
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CwaWebSession } from '../../src/modules/library/cwa-web.js';
import { FIXTURE_BOOKS, makeEpub } from '../fixtures/epub.js';
import type { CwaFixture } from './fixture-file.js';

const stackDir = process.env.CWA_STACK_DIR ?? '';
if (!stackDir) throw new Error('Set CWA_STACK_DIR');
const port = process.env.CWA_PORT ?? '8083';
const baseUrl = `http://127.0.0.1:${port}`;
const composeFile = fileURLToPath(
  new URL('../../../../test/stack/docker-compose.yml', import.meta.url),
);
const KOBO_SHELF = 'Kobo';
// CWA's first-run admin. Only ever used inside the throwaway test container.
const FIRST_RUN_ADMIN = { username: 'admin', password: 'admin123' };

const paths = {
  config: join(stackDir, 'config'),
  library: join(stackDir, 'calibre-library'),
  ingest: join(stackDir, 'cwa-book-ingest'),
};

function log(line: string): void {
  process.stdout.write(`[cwa-fixture] ${line}\n`);
}

function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', '-f', composeFile, ...args], {
    env: { ...process.env, CWA_STACK_DIR: stackDir, CWA_PORT: port },
    encoding: 'utf8',
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(what: string, fn: () => Promise<T | null> | T | null, seconds = 240) {
  const until = Date.now() + seconds * 1000;
  for (;;) {
    try {
      const value = await fn();
      if (value !== null && value !== undefined) return value;
    } catch {
      // not ready yet
    }
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`);
    await sleep(2000);
  }
}

const waitForCwa = () =>
  waitFor('CWA to answer', async () => {
    const res = await fetch(`${baseUrl}/login`);
    return res.ok ? true : null;
  });

/** At least 8 characters with upper, lower, digit and special character (CWA's policy). */
function policyPassword(): string {
  return `${randomBytes(12).toString('base64url')}Aa1!`;
}

function readAppDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(join(paths.config, 'app.db'), { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function flashMessage(html: string): string | undefined {
  return /class="[^"]*alert[^"]*"[^>]*>\s*([^<]+)</.exec(html)?.[1]?.trim();
}

async function expectRedirect(res: Response, what: string): Promise<void> {
  if (res.status < 300 || res.status >= 400) {
    const flash = flashMessage(await res.text());
    throw new Error(`${what} failed (HTTP ${res.status}${flash ? `: ${flash}` : ''})`);
  }
}

async function main(): Promise<void> {
  for (const dir of Object.values(paths)) {
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o777);
  }

  log('starting CWA');
  compose('up', '-d', '--wait');
  await waitForCwa();
  await waitFor('app.db', () =>
    readAppDb((db) => (db.prepare('select count(*) as n from user').get() as { n: number }).n > 0),
  );

  log('switching on Kobo sync and the Kobo Store proxy');
  compose(
    'exec',
    '-T',
    'cwa',
    'python3',
    '-c',
    `import sqlite3
c = sqlite3.connect('/config/app.db')
c.execute('update settings set config_kobo_sync = 1, config_kobo_proxy = 1, config_external_port = ${Number(port)}')
c.commit()`,
  );
  compose('restart', 'cwa');
  await sleep(3000);
  await waitForCwa();

  const admin = new CwaWebSession({ baseUrl, ...FIRST_RUN_ADMIN });
  const accounts = {
    readerA: { username: 'reader-a', password: policyPassword() },
    readerB: { username: 'reader-b', password: policyPassword() },
    service: { username: 'purrshelf-broker', password: policyPassword() },
  };
  const newUser = async (
    account: { username: string; password: string },
    roles: Record<string, string>,
  ) => {
    log(`creating ${account.username}`);
    // CWA answers 200 whether or not it worked, so check app.db afterwards.
    const res = await admin.post('/admin/user/new', {
      name: account.username,
      email: `${account.username}@example.invalid`,
      password: account.password,
      locale: 'en',
      default_language: 'all',
      ...roles,
    });
    const flash = flashMessage(await res.text());
    const created = readAppDb(
      (db) => db.prepare('select 1 from user where name = ?').get(account.username) !== undefined,
    );
    if (!created) throw new Error(`creating ${account.username} failed: ${flash ?? res.status}`);
  };
  await newUser(accounts.readerA, { download_role: 'on', kobo_only_shelves_sync: 'on' });
  await newUser(accounts.readerB, { download_role: 'on', kobo_only_shelves_sync: 'on' });
  await newUser(accounts.service, { download_role: 'on', delete_role: 'on' });

  const userIds = readAppDb((db) =>
    Object.fromEntries(
      (db.prepare('select id, name from user').all() as { id: number; name: string }[]).map((u) => [
        u.name,
        u.id,
      ]),
    ),
  );
  const idOf = (name: string) => {
    const id = userIds[name];
    if (id === undefined) throw new Error(`user ${name} was not created`);
    return id;
  };

  const readerSetup = async (account: { username: string; password: string }, extra: string[]) => {
    const session = new CwaWebSession({ baseUrl, ...account });
    for (const title of [...extra, KOBO_SHELF]) {
      log(`creating shelf "${title}" for ${account.username}`);
      await expectRedirect(
        await session.post('/shelf/create', { title, kobo_sync: title === KOBO_SHELF ? 'on' : '' }),
        `creating shelf ${title}`,
      );
    }
    const tokenPage = await session.get(`/kobo_auth/generate_auth_token/${idOf(account.username)}`);
    if (!tokenPage.ok)
      throw new Error(`Kobo token for ${account.username}: HTTP ${tokenPage.status}`);
  };
  await readerSetup(accounts.readerA, ['Holiday']);
  await readerSetup(accounts.readerB, []);

  log('dropping invented EPUBs into the ingest folder');
  FIXTURE_BOOKS.forEach((book, i) => {
    const file = join(paths.ingest, `fixture-${i + 1}.epub`);
    writeFileSync(file, makeEpub(book));
    chmodSync(file, 0o644);
  });
  const bookIds = await waitFor(
    'CWA to import the fixture books',
    () => {
      const db = new Database(join(paths.library, 'metadata.db'), {
        readonly: true,
        fileMustExist: true,
      });
      try {
        const rows = db.prepare('select id, title from books order by id').all() as {
          id: number;
          title: string;
        }[];
        const ids = FIXTURE_BOOKS.map((b) => rows.find((r) => r.title === b.title)?.id);
        return ids.every((id) => id !== undefined) ? (ids as number[]) : null;
      } finally {
        db.close();
      }
    },
    300,
  );

  const fixture: CwaFixture = {
    baseUrl,
    koboShelfName: KOBO_SHELF,
    metadataDbPath: join(paths.library, 'metadata.db'),
    appDbPath: join(paths.config, 'app.db'),
    service: accounts.service,
    readers: [accounts.readerA, accounts.readerB].map((a) => ({
      ...a,
      cwaUserId: idOf(a.username),
    })),
    bookIds,
  };
  writeFileSync(join(stackDir, 'fixture.json'), JSON.stringify(fixture, null, 2), { mode: 0o600 });
  log(
    `ready: readers ${fixture.readers.map((r) => r.cwaUserId).join(', ')}, books ${bookIds.join(', ')}`,
  );
}

await main();
