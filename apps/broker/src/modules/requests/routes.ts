import {
  endpoints,
  requestEventsPath,
  type BookRequest,
  type ReleaseList,
  type RequestList,
} from '@purrshelf/contract';
import type { FastifyBaseLogger } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { RequestRow } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import { DownloadsNotSetUpError, ReleaseError } from '../releases/pipeline.js';
import type { RequestEvents } from './events.js';
import type { RequestService } from './service.js';
import { InvalidTransitionError } from './status.js';

/** What the add route needs to know about a work: the metadata the search runs on. */
export interface WorkInfo {
  getWork(
    userId: string,
    workId: string,
  ): Promise<{
    title: string;
    authors: string[];
    isbns: string[];
    series?: { name: string; position: number | null } | null;
  }>;
}

/** The release pipeline as far as "Pick another" and Cancel need it. */
export interface ReleaseActions {
  options(request: RequestRow): ReleaseList;
  pickAnother(request: RequestRow, releaseId: string): Promise<RequestRow>;
  stop(request: RequestRow): Promise<void>;
}

export interface RequestRoutesOptions {
  requests: RequestService;
  releases: ReleaseActions;
  events: RequestEvents;
  view: (row: RequestRow) => BookRequest;
  works: WorkInfo;
  /** Ids of the readers a book may be pushed to. */
  readerIds: () => string[];
  requireAuth: PreHandler;
  log: FastifyBaseLogger;
}

/** Every route here runs behind `requireAuth`, which sets the user. */
const userOf = (request: { userId?: string }): string => request.userId as string;

const ISBN13 = /^97[89]\d{10}$/;

/** Turns the pipeline's refusals into stable API errors the app translates. */
function apiError(err: unknown): unknown {
  if (err instanceof InvalidTransitionError) {
    return new AppError(409, 'REQUEST_STATE', err.message);
  }
  if (err instanceof DownloadsNotSetUpError) {
    return new AppError(409, 'DOWNLOADS_NOT_SET_UP', err.message);
  }
  if (err instanceof ReleaseError) return new AppError(409, 'RELEASE_UNAVAILABLE', err.message);
  return err;
}

export const requestRoutes: FastifyPluginAsyncZod<RequestRoutesOptions> = async (app, opts) => {
  const {
    addRequest,
    requests: list,
    request: one,
    requestReleases,
    pickRelease,
    retryRequest,
    cancelRequest,
  } = endpoints;

  /** The user's own request; someone else's is as good as missing. */
  const mine = (userId: string, id: string): RequestRow => {
    const row = opts.requests.find(id);
    if (row?.userId !== userId) throw new AppError(404, 'NOT_FOUND', 'No such request');
    return row;
  };

  const follow = (id: string, done: Promise<unknown>) => {
    done.catch((err: unknown) => {
      opts.log.error({ err, requestId: id }, 'request failed after it was answered');
    });
  };

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
      if (open) return opts.view(open);

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
          ...(work.series
            ? { series: { name: work.series.name, position: work.series.position } }
            : {}),
        },
        pushTo: [...new Set(pushTo)],
      });
      follow(row.id, done);
      return opts.view(row);
    },
  );

  app.get(
    list.path,
    { preHandler: opts.requireAuth, schema: { response: { 200: list.response } } },
    async (request): Promise<RequestList> => ({
      requests: opts.requests.list(userOf(request)).map(opts.view),
    }),
  );

  // Registered before `/requests/:id`, though Fastify prefers the static path anyway.
  app.get(requestEventsPath, { preHandler: opts.requireAuth }, (request, reply) => {
    const userId = userOf(request);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Nginx (Proxy Manager) must not buffer the stream.
      'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');
    const unsubscribe = opts.events.subscribe((row) => {
      if (row.userId !== userId) return;
      res.write(`event: request\ndata: ${JSON.stringify(opts.view(row))}\n\n`);
    });
    request.raw.on('close', unsubscribe);
  });

  app.get(
    one.path,
    {
      preHandler: opts.requireAuth,
      schema: { params: one.params, response: { 200: one.response } },
    },
    async (request): Promise<BookRequest> => opts.view(mine(userOf(request), request.params.id)),
  );

  app.get(
    requestReleases.path,
    {
      preHandler: opts.requireAuth,
      schema: { params: requestReleases.params, response: { 200: requestReleases.response } },
    },
    async (request): Promise<ReleaseList> =>
      opts.releases.options(mine(userOf(request), request.params.id)),
  );

  app.post(
    pickRelease.path,
    {
      preHandler: opts.requireAuth,
      schema: { params: pickRelease.params, response: { 200: pickRelease.response } },
    },
    async (request): Promise<BookRequest> => {
      const row = mine(userOf(request), request.params.id);
      try {
        return opts.view(await opts.releases.pickAnother(row, request.params.releaseId));
      } catch (err) {
        throw apiError(err);
      }
    },
  );

  app.post(
    retryRequest.path,
    {
      preHandler: opts.requireAuth,
      schema: { params: retryRequest.params, response: { 200: retryRequest.response } },
    },
    async (request): Promise<BookRequest> => {
      const row = mine(userOf(request), request.params.id);
      try {
        const { request: started, done } = opts.requests.startRetry(row.id);
        follow(row.id, done);
        return opts.view(started);
      } catch (err) {
        throw apiError(err);
      }
    },
  );

  app.post(
    cancelRequest.path,
    {
      preHandler: opts.requireAuth,
      schema: { params: cancelRequest.params, response: { 200: cancelRequest.response } },
    },
    async (request): Promise<BookRequest> => {
      const row = mine(userOf(request), request.params.id);
      try {
        await opts.releases.stop(row);
        return opts.view(opts.requests.cancel(row.id));
      } catch (err) {
        throw apiError(err);
      }
    },
  );
};
