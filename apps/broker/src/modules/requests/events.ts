import type { RequestRow } from '../../db/schema.js';

export type RequestListener = (request: RequestRow) => void;

/**
 * Every change to a request, as it is written, for the live Requests screen
 * (server-sent events, ADR 0012 and 0023). In process only: one broker.
 */
export class RequestEvents {
  private readonly listeners = new Set<RequestListener>();

  /** Passed to every writer of the requests table. */
  readonly emit = (request: RequestRow): RequestRow => {
    for (const listener of this.listeners) listener(request);
    return request;
  };

  /** Answers the unsubscribe function. */
  subscribe(listener: RequestListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get size(): number {
    return this.listeners.size;
  }
}
