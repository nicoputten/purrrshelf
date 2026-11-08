import { appApkPath, endpoints, type AppRelease } from '@purrshelf/contract';
import { createReadStream } from 'node:fs';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../errors.js';
import type { PreHandler } from '../auth/authenticate.js';
import { AppUpdateError } from './github.js';
import type { AppUpdates, ReadyApp } from './service.js';

export interface AppUpdateRoutesOptions {
  /** Null when APP_RELEASES_REPO is not set. */
  updates: AppUpdates | null;
  requireAuth: PreHandler;
}

/** `GET /app/latest` and `GET /app/latest.apk` (BRK-10). */
export const appUpdateRoutes: FastifyPluginAsyncZod<AppUpdateRoutesOptions> = async (app, opts) => {
  async function ready(): Promise<ReadyApp> {
    if (!opts.updates) {
      throw new AppError(503, 'APP_UPDATE_UNAVAILABLE', 'In-app updates are not set up');
    }
    try {
      return await opts.updates.latest();
    } catch (err) {
      if (!(err instanceof AppUpdateError)) throw err;
      app.log.warn({ err }, 'app update unavailable');
      throw new AppError(503, 'APP_UPDATE_UNAVAILABLE', 'No app update information right now');
    }
  }

  const { appLatest } = endpoints;
  app.get(
    appLatest.path,
    { preHandler: opts.requireAuth, schema: { response: { 200: appLatest.response } } },
    async (): Promise<AppRelease> => (await ready()).release,
  );

  app.get(appApkPath, { preHandler: opts.requireAuth }, async (_request, reply) => {
    const { release, path } = await ready();
    return reply
      .header('content-type', 'application/vnd.android.package-archive')
      .header('content-length', release.size)
      .header('content-disposition', `attachment; filename="purrshelf-${release.version}.apk"`)
      .header('etag', `"${release.sha256}"`)
      .header('cache-control', 'private, no-cache')
      .send(createReadStream(path));
  });
};
