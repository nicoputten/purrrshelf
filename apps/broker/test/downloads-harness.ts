import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import { UserRepository } from '../src/modules/auth/users.js';
import { createDownloads, type Downloads } from '../src/modules/downloads.js';
import type { IndexerInput } from '../src/modules/indexers/repository.js';
import type { BookQuery } from '../src/modules/search/planner.js';
import type { LibraryLookup } from '../src/modules/search/service.js';
import { FakeNewznab } from './fake-newznab.js';
import { PASSWORD, TestClock } from './helpers.js';
export const QUERY: BookQuery = {
  title: 'The Lighthouse Cartographer',
  authors: ['Ada Quill'],
  isbn13: '9780000000002',
  language: 'en',
};

export function indexerInput(overrides: Partial<IndexerInput> = {}): IndexerInput {
  return {
    id: 'primary',
    name: 'Primary',
    url: 'https://indexer.example.invalid',
    priority: 0,
    searchLimitPerHour: 25,
    grabLimitPerHour: 25,
    ...overrides,
  };
}

export interface Harness extends Downloads {
  database: DatabaseHandle;
  clock: TestClock;
  fakes: Map<string, FakeNewznab>;
  library: { books: Map<string, number> } & LibraryLookup;
  userId: string;
  env: NodeJS.ProcessEnv;
  /** Total calls to every fake indexer. */
  calls: () => number;
}

/** The whole downloads stack against fake indexers (one FakeNewznab per host). */
export async function makeHarness(): Promise<Harness> {
  const database = openDatabase(':memory:');
  const clock = new TestClock();
  const fakes = new Map<string, FakeNewznab>();
  const fetch = (url: string, init: RequestInit) => {
    const host = new URL(url).host;
    let fake = fakes.get(host);
    if (!fake) fakes.set(host, (fake = new FakeNewznab()));
    return fake.fetch(url, init);
  };
  const env: NodeJS.ProcessEnv = {
    INDEXER_PRIMARY_API_KEY: 'fake-key',
    INDEXER_BACKUP_API_KEY: 'fake-key-2',
  };
  const library = {
    books: new Map<string, number>(),
    findBook: async (q: BookQuery) => {
      const id = library.books.get(q.title);
      return id === undefined ? null : { calibreBookId: id };
    },
  };
  const downloads = createDownloads({
    db: database.db,
    clock: clock.fn,
    env,
    library,
    log: { error: () => undefined },
    fetch,
  });
  const user = await new UserRepository(database.db, clock.fn).create({
    username: 'reader',
    displayName: 'Reader One',
    password: PASSWORD,
  });
  return {
    ...downloads,
    database,
    clock,
    fakes,
    library,
    userId: user.id,
    env,
    calls: () => [...fakes.values()].reduce((n, f) => n + f.calls.length, 0),
  };
}

export function fakeFor(h: Harness, host: string): FakeNewznab {
  let fake = h.fakes.get(host);
  if (!fake) h.fakes.set(host, (fake = new FakeNewznab()));
  return fake;
}
