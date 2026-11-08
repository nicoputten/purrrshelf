import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReadOnlySqlite } from '../../src/modules/library/sqlite-readonly.js';

let dir: string;
let ro: ReadOnlySqlite;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'purrshelf-ro-'));
  const path = join(dir, 'app.db');
  const db = new Database(path);
  db.exec('create table t (n integer); insert into t values (1)');
  db.close();
  ro = new ReadOnlySqlite(path, 'test.db');
});

afterEach(() => {
  ro.close();
  rmSync(dir, { recursive: true, force: true });
});

const sqliteError = (code: string) => Object.assign(new Error(code), { code });

describe('ReadOnlySqlite', () => {
  it.each(['SQLITE_BUSY', 'SQLITE_READONLY_RECOVERY', 'SQLITE_PROTOCOL'])(
    'retries %s while the owner recovers the WAL',
    (code) => {
      let calls = 0;
      const n = ro.run((db) => {
        calls++;
        if (calls < 3) throw sqliteError(code);
        return (db.prepare('select n from t').get() as { n: number }).n;
      });
      expect(n).toBe(1);
      expect(calls).toBe(3);
    },
  );

  it('gives up after five attempts', () => {
    let calls = 0;
    expect(() =>
      ro.run(() => {
        calls++;
        throw sqliteError('SQLITE_READONLY_RECOVERY');
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'LIBRARY_UNAVAILABLE',
        details: { cause: 'SQLITE_READONLY_RECOVERY' },
      }),
    );
    expect(calls).toBe(5);
  });

  it('does not retry other errors', () => {
    let calls = 0;
    expect(() =>
      ro.run(() => {
        calls++;
        throw new Error('no such table: shelf');
      }),
    ).toThrow(expect.objectContaining({ code: 'LIBRARY_UNAVAILABLE' }));
    expect(calls).toBe(1);
  });
});
