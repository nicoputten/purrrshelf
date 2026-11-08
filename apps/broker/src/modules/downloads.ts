import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { IndexerBudget } from './budget/budget.js';
import { createIndexerGateway, type IndexerGateway } from './budget/gateway.js';
import type { FetchLike } from './budget/newznab.js';
import { IndexerRepository } from './indexers/repository.js';
import { JobRunner, type JobLogger } from './jobs/runner.js';
import {
  POLL_DOWNLOAD_JOB,
  ReleasePipeline,
  WAIT_IMPORT_JOB,
  type ImportLibrary,
  type PipelineSettings,
} from './releases/pipeline.js';
import { RESUME_SEARCH_JOB, RequestService } from './requests/service.js';
import type { DownloadClient } from './sabnzbd/client.js';
import { titleMatchJudge } from './search/judge.js';
import { IndexerSearch, type LibraryLookup } from './search/service.js';

export interface DownloadsDeps {
  db: Db;
  clock: Clock;
  env: NodeJS.ProcessEnv;
  log: JobLogger;
  library: LibraryLookup;
  fetch?: FetchLike;
  /** SABnzbd; null until configured. */
  sab?: DownloadClient | null;
  /** The library adapter, for the import check; null until configured. */
  importLibrary?: ImportLibrary | null;
  settings?: Partial<PipelineSettings>;
}

const DEFAULT_SETTINGS: PipelineSettings = {
  downloadsPath: '/downloads',
  ingestPath: '/cwa-book-ingest',
  pollIntervalMs: 15_000,
  importTimeoutMs: 30 * 60_000,
  maxBookBytes: 50 * 1024 * 1024,
};

export interface Downloads {
  budget: IndexerBudget;
  indexers: IndexerRepository;
  gateway: IndexerGateway;
  requests: RequestService;
  pipeline: ReleasePipeline;
  jobs: JobRunner;
}

/** Wires budget → gateway → search → requests, plus the job runner that resumes waiting requests. */
export function createDownloads(deps: DownloadsDeps): Downloads {
  const indexers = new IndexerRepository(deps.db, deps.clock);
  const budget = new IndexerBudget(deps.db, deps.clock);
  const gateway = createIndexerGateway({
    budget,
    indexers,
    env: deps.env,
    clock: deps.clock,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  const search = new IndexerSearch(
    deps.db,
    gateway,
    indexers,
    deps.library,
    titleMatchJudge,
    deps.clock,
  );
  const holder: { jobs?: JobRunner } = {};
  const schedule = (type: string, payload: unknown, runAt: Date) =>
    holder.jobs?.schedule(type, payload, runAt);
  const pipeline = new ReleasePipeline({
    db: deps.db,
    clock: deps.clock,
    gateway,
    indexers,
    sab: deps.sab ?? null,
    library: deps.importLibrary ?? null,
    schedule,
    settings: { ...DEFAULT_SETTINGS, ...deps.settings },
  });
  const requests = new RequestService(
    deps.db,
    search,
    (requestId, runAt) => schedule(RESUME_SEARCH_JOB, { requestId }, runAt),
    (request) => pipeline.pick(request),
    deps.clock,
  );
  /**
   * The job types. Only two can reach an indexer, both through the budget:
   * resuming a search that waited for budget, and the download poll, which
   * grabs the next-best NZB of the same result list when a download failed.
   */
  const jobs = new JobRunner(
    deps.db,
    deps.clock,
    {
      [RESUME_SEARCH_JOB]: requests.resumeJob,
      [POLL_DOWNLOAD_JOB]: pipeline.pollJob,
      [WAIT_IMPORT_JOB]: pipeline.waitImportJob,
    },
    deps.log,
  );
  holder.jobs = jobs;
  return { budget, indexers, gateway, requests, pipeline, jobs };
}
