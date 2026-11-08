import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { POLL_DOWNLOAD_JOB, WAIT_IMPORT_JOB } from '../src/modules/releases/pipeline.js';
import { RESUME_SEARCH_JOB } from '../src/modules/requests/service.js';
import { makeTestApp, type TestContext } from './helpers.js';

/**
 * CLAUDE.md: no code path may search an indexer outside the budget module,
 * and nothing calls an indexer on a timer except the waiting_budget job.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function sources(dir = SRC): { path: string; code: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return e.name.endsWith('.ts')
      ? [{ path: relative(SRC, full), code: readFileSync(full, 'utf8') }]
      : [];
  });
}

/** Value (non-type) imports of a module, matched by its file name. */
function importers(module: string): string[] {
  const valueImport = new RegExp(`^import (?!type )[^;]*from '[^']*/${module}\\.js';`, 'ms');
  return sources()
    .filter((f) => valueImport.test(f.code))
    .map((f) => f.path)
    .sort();
}

describe('budget safety', () => {
  it('only the gateway touches the Newznab client', () => {
    expect(importers('newznab')).toEqual(['modules/budget/gateway.ts']);
  });

  it('every gateway call spends from the budget first', () => {
    const gateway = sources().find((f) => f.path === 'modules/budget/gateway.ts')!.code;
    const clientCalls = gateway.match(/this\.client\.\w+\(/g) ?? [];
    const budgeted = gateway.match(/this\.budget\.spend\([^)]*\(\) => this\.client\.\w+\(/g) ?? [];
    expect(clientCalls.length).toBeGreaterThan(0);
    expect(budgeted).toHaveLength(clientCalls.length);
  });

  it('only the downloads wiring and the admin CLI build a gateway', () => {
    expect(importers('gateway')).toEqual(['cli.ts', 'modules/downloads.ts']);
  });

  it('nothing outside the job runner schedules timers', () => {
    const timed = sources()
      .filter((f) => /\bset(Interval|Timeout|Immediate)\(/.test(f.code))
      .map((f) => f.path);
    expect(timed).toEqual(['modules/jobs/runner.ts']);
  });

  it('nothing outside the budget module names the Newznab API', () => {
    const named = sources()
      .filter((f) => /[?&]t=|'apikey'|\/api\?/.test(f.code))
      .map((f) => f.path);
    expect(named.every((p) => p.startsWith('modules/budget/'))).toBe(true);
  });
});

describe('the running broker', () => {
  let ctx: TestContext;
  afterEach(async () => {
    await ctx?.close();
  });

  it('runs only the known job types: no RSS, no "search missing", no retries', async () => {
    ctx = await makeTestApp();
    // Only the resume job searches; the download poll may grab the next NZB of the same list.
    expect(ctx.app.downloads.jobs.types).toEqual([
      RESUME_SEARCH_JOB,
      POLL_DOWNLOAD_JOB,
      WAIT_IMPORT_JOB,
    ]);
  });

  it('only the search module and the CLI search; the pipeline only grabs', () => {
    const searchers = sources()
      .filter((f) => /gateway\.(search|caps)\(/.test(f.code))
      .map((f) => f.path)
      .sort();
    expect(searchers).toEqual(['cli.ts', 'modules/search/service.ts']);
  });
});
