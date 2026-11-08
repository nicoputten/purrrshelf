import { join } from 'node:path';
import type { Config } from '../../config.js';
import { CwaAdapter } from './cwa-adapter.js';
import type { Fetch } from './cwa-web.js';

export type * from './types.js';
export { CwaAdapter } from './cwa-adapter.js';

/** The CWA adapter from config, or null when CWA_BASE_URL is not set. */
export function createLibrary(config: Config, fetch?: Fetch): CwaAdapter | null {
  if (!config.CWA_BASE_URL || !config.CWA_SERVICE_USER || !config.CWA_SERVICE_PASSWORD) return null;
  return new CwaAdapter({
    baseUrl: config.CWA_BASE_URL,
    serviceUser: config.CWA_SERVICE_USER,
    servicePassword: config.CWA_SERVICE_PASSWORD,
    koboShelfName: config.CWA_KOBO_SHELF_NAME,
    metadataDbPath: join(config.CALIBRE_LIBRARY_PATH, 'metadata.db'),
    appDbPath: join(config.CWA_CONFIG_PATH, 'app.db'),
    fetch,
  });
}
