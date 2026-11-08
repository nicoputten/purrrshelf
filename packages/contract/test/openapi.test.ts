import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOpenApi, endpoints, errorCodes } from '../src/index.js';

describe('buildOpenApi', () => {
  const doc = buildOpenApi('1.0.0') as {
    paths: Record<string, Record<string, { security?: unknown; requestBody?: unknown }>>;
    components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
  };

  it('has one operation per endpoint, under /api/v1', () => {
    const ops = Object.values(doc.paths).flatMap((p) => Object.keys(p));
    expect(ops).toHaveLength(Object.keys(endpoints).length);
    expect(Object.keys(doc.paths).every((p) => p.startsWith('/api/v1/'))).toBe(true);
  });

  it('marks authenticated endpoints with bearer security', () => {
    expect(doc.paths['/api/v1/me']!.get!.security).toEqual([{ bearer: [] }]);
    expect(doc.paths['/api/v1/auth/login']!.post!.security).toBeUndefined();
    expect(doc.paths['/api/v1/auth/login']!.post!.requestBody).toBeDefined();
  });

  it('documents path and query parameters', () => {
    const work = doc.paths['/api/v1/works/{id}']!.get! as { parameters?: unknown[] };
    expect(work.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
    const search = doc.paths['/api/v1/discover/search']!.get! as { parameters?: unknown[] };
    expect(search.parameters).toEqual([
      expect.objectContaining({ name: 'q', in: 'query', required: true }),
      expect.objectContaining({ name: 'author', in: 'query', required: false }),
      expect.objectContaining({ name: 'language', in: 'query', required: false }),
    ]);
  });

  it('documents every error code', () => {
    expect(doc.components.schemas.ErrorResponse!.properties!.code!.enum).toEqual([...errorCodes]);
  });

  it('matches the committed openapi.json (run `pnpm --filter @purrshelf/contract openapi`)', () => {
    const committed: unknown = JSON.parse(
      readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'),
    );
    expect(committed).toEqual(doc);
  });
});
