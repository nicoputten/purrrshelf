import { parseArgs } from 'node:util';
import { Locale } from '@purrshelf/contract';
import { systemClock } from './clock.js';
import type { DatabaseHandle } from './db/index.js';
import { UserError, UserRepository } from './modules/auth/users.js';

export interface CliIo {
  env: NodeJS.ProcessEnv;
  /** Reads the password: from PURRSHELF_PASSWORD, or the first line of stdin. */
  readPassword: () => Promise<string>;
  out: (line: string) => void;
  err: (line: string) => void;
  openDatabase: (path: string) => DatabaseHandle;
}

const USAGE = `Usage:
  purrshelf user add <username> --name <display name> [--locale en|nl]
  purrshelf user set-password <username>
  purrshelf user list

The password is read from PURRSHELF_PASSWORD or from the first line of stdin.
The database is DATABASE_PATH (default /data/purrshelf.db).`;

/** Small admin CLI, so no account or password ever has to live in the repo. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { name: { type: 'string' }, locale: { type: 'string' }, help: { type: 'boolean' } },
    });
  } catch (e) {
    io.err((e as Error).message);
    io.err(USAGE);
    return 2;
  }
  const { positionals, values } = parsed;
  const [group, command, username] = positionals;
  if (values.help || group !== 'user' || !command) {
    (values.help ? io.out : io.err)(USAGE);
    return values.help ? 0 : 2;
  }

  const database = io.openDatabase(io.env.DATABASE_PATH ?? '/data/purrshelf.db');
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
