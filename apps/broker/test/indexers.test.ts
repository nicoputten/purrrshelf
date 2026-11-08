import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseHandle } from '../src/db/index.js';
import { IndexerError, IndexerRepository } from '../src/modules/indexers/repository.js';
import { TestClock } from './helpers.js';

let database: DatabaseHandle;
let repo: IndexerRepository;
const base = {
  id: 'primary',
  name: 'Primary',
  url: 'https://indexer.example.invalid/',
  priority: 0,
  searchLimitPerDay: 25,
  grabLimitPerDay: 25,
};

beforeEach(() => {
  database = openDatabase(':memory:');
  repo = new IndexerRepository(database.db, new TestClock().fn);
});

describe('IndexerRepository', () => {
  it('adds an indexer and trims the trailing slash of its URL', () => {
    const row = repo.upsert(base);
    expect(row).toMatchObject({ id: 'primary', url: 'https://indexer.example.invalid' });
    expect(repo.get('primary')).toEqual(row);
    expect(repo.get('other')).toBeUndefined();
  });

  it('updates an existing indexer but keeps its creation time and caps', () => {
    const first = repo.upsert(base);
    repo.setCaps('primary', '{"book":true}');
    const second = repo.upsert({ ...base, name: 'Renamed', priority: 2 });
    expect(second).toMatchObject({
      name: 'Renamed',
      priority: 2,
      createdAt: first.createdAt,
      capsJson: '{"book":true}',
    });
  });

  it('lists indexers by priority, then id', () => {
    repo.upsert({ ...base, id: 'b', priority: 1 });
    repo.upsert({ ...base, id: 'a', priority: 1 });
    repo.upsert({ ...base, id: 'z', priority: 0 });
    expect(repo.list().map((i) => i.id)).toEqual(['z', 'a', 'b']);
  });

  it('removes an indexer', () => {
    repo.upsert(base);
    expect(repo.remove('primary')).toBe(true);
    expect(repo.remove('primary')).toBe(false);
    expect(repo.list()).toEqual([]);
  });

  it.each([
    [{ id: 'Bad-Id' }, /id/],
    [{ id: '' }, /id/],
    [{ name: ' ' }, /name/i],
    [{ url: 'ftp://indexer.example.invalid' }, /URL/],
    [{ url: 'not a url' }, /URL/],
    [{ searchLimitPerDay: -1 }, /limit/],
    [{ grabLimitPerDay: 1.5 }, /limit/],
    [{ priority: 0.5 }, /priority/i],
  ])('rejects %j', (patch, message) => {
    expect(() => repo.upsert({ ...base, ...patch })).toThrow(IndexerError);
    expect(() => repo.upsert({ ...base, ...patch })).toThrow(message);
  });

  it('names the env variable that holds the key', () => {
    expect(IndexerRepository.apiKeyEnvName('primary_2')).toBe('INDEXER_PRIMARY_2_API_KEY');
  });
});
