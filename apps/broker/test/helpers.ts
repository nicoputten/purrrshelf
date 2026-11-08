import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import type { HealthCheck } from '../src/modules/health/routes.js';
import { UserRepository } from '../src/modules/auth/users.js';

/** Fake secret for tests only. */
export const TEST_SECRET = 'fake'.repeat(10);
export const PASSWORD = 'correct horse battery';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({ LOG_LEVEL: 'silent', JWT_SECRET: TEST_SECRET, ...overrides });
}

export class TestClock {
  constructor(public now = new Date('2026-01-01T12:00:00.000Z')) {}
  readonly fn = (): Date => new Date(this.now);
  advance(ms: number): void {
    this.now = new Date(this.now.getTime() + ms);
  }
}

export interface TestContext {
  app: FastifyInstance;
  database: DatabaseHandle;
  clock: TestClock;
  users: UserRepository;
  close: () => Promise<void>;
}

export async function makeTestApp(
  opts: { config?: Record<string, string>; healthChecks?: HealthCheck[]; withUser?: boolean } = {},
): Promise<TestContext> {
  const database = openDatabase(':memory:');
  const clock = new TestClock();
  const users = new UserRepository(database.db, clock.fn);
  if (opts.withUser !== false) {
    await users.create({
      username: 'reader',
      displayName: 'Reader One',
      password: PASSWORD,
      locale: 'nl',
    });
  }
  const app = await buildApp({
    config: testConfig(opts.config),
    database,
    clock: clock.fn,
    healthChecks: opts.healthChecks ?? [],
  });
  return {
    app,
    database,
    clock,
    users,
    close: async () => {
      await app.close();
      database.close();
    },
  };
}

export async function login(app: FastifyInstance, username = 'reader', password = PASSWORD) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } });
}
