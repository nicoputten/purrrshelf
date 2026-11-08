import { parseArgs } from 'node:util';
import { Locale } from '@purrshelf/contract';
import { systemClock } from './clock.js';
import type { DatabaseHandle } from './db/index.js';
import { join } from 'node:path';
import { UserError, UserRepository } from './modules/auth/users.js';
import { CwaAppDb } from './modules/library/cwa-app-db.js';
import {
  BudgetExhaustedError,
  IndexerBudget,
  IndexerLimitReachedError,
} from './modules/budget/budget.js';
import {
  createIndexerGateway,
  IndexerRequestError,
  MissingApiKeyError,
} from './modules/budget/gateway.js';
import type { FetchLike } from './modules/budget/newznab.js';
import { IndexerError, IndexerRepository } from './modules/indexers/repository.js';

export interface CliIo {
  env: NodeJS.ProcessEnv;
  /** Reads the password: from PURRSHELF_PASSWORD, or the first line of stdin. */
  readPassword: () => Promise<string>;
  out: (line: string) => void;
  err: (line: string) => void;
  openDatabase: (path: string) => DatabaseHandle;
  /** Tests swap the indexer HTTP client. */
  fetch?: FetchLike;
}

const USAGE = `Usage:
  purrshelf user add <username> --name <display name> [--locale en|nl]
  purrshelf user set-password <username>
  purrshelf user list
  purrshelf user link-cwa <username> --cwa-user <CWA user name>
  purrshelf user unlink-cwa <username>
  purrshelf indexer add <id> --name <name> --url <url> --search-limit <n> --grab-limit <n> [--priority <n>]
  purrshelf indexer list
  purrshelf indexer remove <id>
  purrshelf indexer caps <id>      (reads t=caps once; costs one search from the budget)

The password is read from PURRSHELF_PASSWORD or from the first line of stdin.
Adding an existing indexer id updates it. The indexer's API key is never
stored: set INDEXER_<ID>_API_KEY in the broker's environment.
The database is DATABASE_PATH (default /data/purrshelf.db).
link-cwa reads CWA's app.db from CWA_CONFIG_PATH (default /cwa-config) and
checks the reader's Kobo shelf (CWA_KOBO_SHELF_NAME, default Kobo) and Kobo
sync token, so the app can send books to that reader's Kobo.`;

/** Small admin CLI, so no account or password ever has to live in the repo. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        name: { type: 'string' },
        locale: { type: 'string' },
        url: { type: 'string' },
        priority: { type: 'string' },
        'search-limit': { type: 'string' },
        'grab-limit': { type: 'string' },
        'cwa-user': { type: 'string' },
        help: { type: 'boolean' },
      },
    });
  } catch (e) {
    io.err((e as Error).message);
    io.err(USAGE);
    return 2;
  }
  const { positionals, values } = parsed;
  const [group, command, username] = positionals;
  if (values.help || (group !== 'user' && group !== 'indexer') || !command) {
    (values.help ? io.out : io.err)(USAGE);
    return values.help ? 0 : 2;
  }

  const database = io.openDatabase(io.env.DATABASE_PATH ?? '/data/purrshelf.db');
  if (group === 'indexer') {
    try {
      return await indexerCommand(command, username, values, database, io);
    } finally {
      database.close();
    }
  }
  const users = new UserRepository(database.db, systemClock);
  try {
    switch (command) {
      case 'list': {
        for (const u of users.list()) io.out(`${u.username}\t${u.displayName}\t${u.locale}`);
        return 0;
      }
      case 'add': {
        if (!username || !values.name) {
          io.err(USAGE);
          return 2;
        }
        const locale = Locale.safeParse(values.locale ?? 'en');
        if (!locale.success) {
          io.err('--locale must be en or nl');
          return 2;
        }
        const password = await io.readPassword();
        const user = await users.create({
          username,
          displayName: values.name,
          password,
          locale: locale.data,
        });
        io.out(`Created user ${user.username}`);
        return 0;
      }
      case 'link-cwa': {
        const cwaUser = values['cwa-user'];
        if (!username || !cwaUser) {
          io.err(USAGE);
          return 2;
        }
        return linkCwa(users, username, cwaUser, io);
      }
      case 'unlink-cwa': {
        if (!username) {
          io.err(USAGE);
          return 2;
        }
        const user = users.setCwaUserId(username, null);
        io.out(`Unlinked ${user.username} from CWA`);
        return 0;
      }
      case 'set-password': {
        if (!username) {
          io.err(USAGE);
          return 2;
        }
        await users.setPassword(username, await io.readPassword());
        io.out(`Password updated for ${username.trim().toLowerCase()}`);
        return 0;
      }
      default:
        io.err(USAGE);
        return 2;
    }
  } catch (e) {
    if (e instanceof UserError) {
      io.err(e.message);
      return 1;
    }
    throw e;
  } finally {
    database.close();
  }
}

/** Links a broker user to a CWA user and says what is still missing for their Kobo. */
function linkCwa(users: UserRepository, username: string, cwaUser: string, io: CliIo): number {
  const appDb = new CwaAppDb(join(io.env.CWA_CONFIG_PATH ?? '/cwa-config', 'app.db'));
  try {
    const cwaUserId = appDb.userIdByName(cwaUser);
    if (cwaUserId === null) {
      io.err(`CWA has no user "${cwaUser}"`);
      return 1;
    }
    const user = users.setCwaUserId(username, cwaUserId);
    io.out(`Linked ${user.username} to CWA user ${cwaUser} (id ${cwaUserId})`);
    const shelfName = io.env.CWA_KOBO_SHELF_NAME ?? 'Kobo';
    const shelves = appDb.shelvesByName(cwaUserId, shelfName);
    if (shelves.length !== 1 || !shelves[0]?.koboSync) {
      io.err(`Warning: ${cwaUser} needs exactly one shelf "${shelfName}" with Kobo sync on`);
    }
    if (!appDb.koboToken(cwaUserId)) {
      io.err(`Warning: ${cwaUser} has not set up Kobo sync in CWA yet`);
    }
    return 0;
  } catch (e) {
    if (e instanceof UserError) throw e;
    io.err(`Cannot read CWA's app.db: ${(e as Error).message}`);
    return 1;
  } finally {
    appDb.close();
  }
}

interface IndexerFlags {
  name?: string | undefined;
  url?: string | undefined;
  priority?: string | undefined;
  'search-limit'?: string | undefined;
  'grab-limit'?: string | undefined;
}

/** A whole number from a flag, or NaN so validation reports it. */
function int(value: string | undefined): number {
  return value !== undefined && /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
}

async function indexerCommand(
  command: string,
  id: string | undefined,
  flags: IndexerFlags,
  database: DatabaseHandle,
  io: CliIo,
): Promise<number> {
  const repo = new IndexerRepository(database.db, systemClock);
  try {
    switch (command) {
      case 'list': {
        for (const i of repo.list()) {
          const key = IndexerRepository.apiKeyEnvName(i.id);
          const keySet = io.env[key] ? 'key set' : `${key} missing`;
          io.out(
            `${i.id}\t${i.name}\tpriority ${i.priority}\t${i.searchLimitPerHour} searches/h\t${i.grabLimitPerHour} grabs/h\t${keySet}`,
          );
        }
        return 0;
      }
      case 'add': {
        if (!id || !flags.name || !flags.url || !flags['search-limit'] || !flags['grab-limit']) {
          io.err(USAGE);
          return 2;
        }
        const row = repo.upsert({
          id,
          name: flags.name,
          url: flags.url,
          priority: flags.priority === undefined ? 0 : int(flags.priority),
          searchLimitPerHour: int(flags['search-limit']),
          grabLimitPerHour: int(flags['grab-limit']),
        });
        io.out(
          `Saved indexer ${row.id}; set ${IndexerRepository.apiKeyEnvName(row.id)} in the environment`,
        );
        return 0;
      }
      case 'caps': {
        const indexer = id ? repo.get(id) : undefined;
        if (!id || !indexer) {
          io.err(id ? `No indexer "${id}"` : USAGE);
          return id ? 1 : 2;
        }
        const gateway = createIndexerGateway({
          budget: new IndexerBudget(database.db, systemClock),
          indexers: repo,
          env: io.env,
          clock: systemClock,
          ...(io.fetch ? { fetch: io.fetch } : {}),
        });
        const caps = await gateway.caps(indexer);
        io.out(
          caps.bookSearch
            ? `${id}: book search with ${caps.bookParams.join(', ') || 'no parameters'}`
            : `${id}: no book search; free-text search only`,
        );
        return 0;
      }
      case 'remove': {
        if (!id) {
          io.err(USAGE);
          return 2;
        }
        if (!repo.remove(id)) {
          io.err(`No indexer "${id}"`);
          return 1;
        }
        io.out(`Removed indexer ${id}`);
        return 0;
      }
      default:
        io.err(USAGE);
        return 2;
    }
  } catch (e) {
    if (
      e instanceof IndexerError ||
      e instanceof BudgetExhaustedError ||
      e instanceof MissingApiKeyError ||
      e instanceof IndexerRequestError ||
      e instanceof IndexerLimitReachedError
    ) {
      io.err(e.message);
      return 1;
    }
    throw e;
  }
}
