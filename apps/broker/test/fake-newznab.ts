import { readFileSync } from 'node:fs';
import type { FetchLike } from '../src/modules/budget/newznab.js';

export function fixture(name: string): string {
  return readFileSync(new URL(`../../../test/fixtures/newznab/${name}`, import.meta.url), 'utf8');
}

export interface FakeReply {
  status?: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * A fake Newznab server: answers by `t` (and optionally by query), records
 * every URL it was called with.
 */
export class FakeNewznab {
  readonly calls: URL[] = [];
  private readonly replies = new Map<string, FakeReply | (() => FakeReply)>();
  fallback: FakeReply = { body: fixture('search-empty.xml') };

  /** Key: `t` value, or `t:q` / `t:title` for one specific query. */
  on(key: string, reply: FakeReply | (() => FakeReply)): this {
    this.replies.set(key, reply);
    return this;
  }

  readonly fetch: FetchLike = async (input) => {
    const url = new URL(input);
    this.calls.push(url);
    const t = url.searchParams.get('t') ?? '';
    const q = url.searchParams.get('q') ?? url.searchParams.get('title') ?? '';
    const r = this.replies.get(`${t}:${q}`) ?? this.replies.get(t) ?? this.fallback;
    const reply = typeof r === 'function' ? r() : r;
    return new Response(reply.body, { status: reply.status ?? 200, headers: reply.headers ?? {} });
  };
}
