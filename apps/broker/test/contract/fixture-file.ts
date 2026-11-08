import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the CWA fixture writes to `$CWA_STACK_DIR/fixture.json` for the contract tests. */
export interface CwaFixture {
  baseUrl: string;
  koboShelfName: string;
  metadataDbPath: string;
  appDbPath: string;
  service: { username: string; password: string };
  readers: { username: string; password: string; cwaUserId: number }[];
  bookIds: number[];
}

/** The fixture, or null when no CWA stack is running (the contract tests are then skipped). */
export function loadFixture(): CwaFixture | null {
  const dir = process.env.CWA_STACK_DIR;
  if (!dir) return null;
  return JSON.parse(readFileSync(join(dir, 'fixture.json'), 'utf8')) as CwaFixture;
}
