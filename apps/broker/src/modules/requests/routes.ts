import { endpoints, type BookRequest, type RequestList } from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { RequestRow } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import type { RequestService } from './service.js';

/** What the add route needs to know about a work: the metadata the search runs on. */
export interface WorkInfo {
  getWork(
    userId: string,
    workId: string,
  ): Promise<{ title: string; authors: string[]; isbns: string[] }>;
}

export interface RequestRoutesOptions {
  requests: RequestService;
  works: WorkInfo;
  /** Ids of the readers a book may be pushed to. */
  readerIds: () => string[];
  requireAuth: PreHandler;
  log: FastifyBaseLogger;
}

export function toBookRequest(row: RequestRow): BookRequest {
  const query = JSON.parse(row.queryJson) as { title: string; authors: string[] };
  return {
    id: row.id,
    workId: row.workId,
    title: query.title,
    authors: query.authors,
    language: row.language,
    mediaType: row.mediaType,
    status: row.status,
    progress: row.progress,
    error: row.error,
    pushTo: JSON.parse(row.pushToJson) as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every route here runs behind `requireAuth`, which sets the user. */
const userOf = (request: { userId?: string }): string => request.userId as string;

const ISBN13 = /^97[89]\d{10}$/;

export const requestRoutes: FastifyPluginAsyncZod<RequestRoutesOptions> = async (app, opts) => {
  const { addRequest, requests: list, request: one } = endpoints;

  app.post(
    addRequest.path,
    {
      preHandler: opts.requireAuth,
      schema: { body: addRequest.body, response: { 201: addRequest.response } },
    },
    async (request, reply): Promise<BookRequest> => {
      const userId = userOf(request);
      const { workId, language, pushTo } = request.body;
      const readers = new Set(opts.readerIds());
      const unknown = pushTo.filter((id) => !readers.has(id));
      if (unknown.length > 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Unknown reader', { pushTo: unknown });
      }
      reply.status(201);
      // Adding twice must never pay for a second search.
      const open = opts.requests.findOpen(userId, workId);
      if (open) return toBookRequest(open);

      const work = await opts.works.getWork(userId, workId);
      const isbn13 = work.isbns.find((i) => ISBN13.test(i));
      const { request: row, done } = opts.requests.start({
        userId,
        workId,
        query: {
          title: work.title,
          authors: work.authors,
          language,
          ...(isbn13 ? { isbn13 } : {}),
        },
        pushTo: [...new Set(pushTo)],
      });
      done.catch((err: unknown) => {
        opts.log.error({ err, requestId: row.id }, 'request failed after add');
      });
      return toBookRequest(row);
    },
  );

  app.get(
    list.path,
    { preHandler: opts.requireAuth, schema: { response: { 200: list.response } } },
    async (request): Promise<RequestList> => ({
      requests: opts.requests.list(userOf(request)).map(toBookRequest),
    }),
  );

  app.get(
    one.path,
    {
      preHandler: opts.requireAuth,
      schema: { params: one.params, response: { 200: one.response } },
    },
    async (request): Promise<BookRequest> => {
      const userId = userOf(request);
      const row = opts.requests.find(request.params.id);
      // Someone else's request is as good as missing.
      if (row?.userId !== userId) throw new AppError(404, 'NOT_FOUND', 'No such request');
      return toBookRequest(row);
    },
  );
};
