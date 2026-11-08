import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { IndexerBudget } from './budget/budget.js';
import { createIndexerGateway, type IndexerGateway } from './budget/gateway.js';
import type { FetchLike } from './budget/newznab.js';
import { IndexerRepository } from './indexers/repository.js';
import { JobRunner, type JobLogger } from './jobs/runner.js';
import { RESUME_SEARCH_JOB, RequestService } from './requests/service.js';
import { titleMatchJudge } from './search/judge.js';
import { IndexerSearch, type LibraryLookup } from './search/service.js';

export interface DownloadsDeps {
  db: Db;
  clock: Clock;
  env: NodeJS.ProcessEnv;
  log: JobLogger;
  library: LibraryLookup;
  fetch?: FetchLike;
}

export interface Downloads {
  budget: IndexerBudget;
  indexers: IndexerRepository;
  gateway: IndexerGateway;
  requests: RequestService;
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
  const requests = new RequestService(
    deps.db,
    search,
    (requestId, runAt) => holder.jobs?.schedule(RESUME_SEARCH_JOB, { requestId }, runAt),
    deps.clock,
  );
  // The only job that may reach an indexer: resuming a request that waited for budget.
  const jobs = new JobRunner(
    deps.db,
    deps.clock,
    { [RESUME_SEARCH_JOB]: requests.resumeJob },
    deps.log,
  );
  holder.jobs = jobs;
  return { budget, indexers, gateway, requests, jobs };
}
