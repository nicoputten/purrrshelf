import type { Clock } from '../../clock.js';
import type { Indexer } from '../../db/schema.js';
import { IndexerRepository } from '../indexers/repository.js';
import type { IndexerBudget } from './budget.js';
import {
  IndexerRequestError,
  NewznabClient,
  type FetchLike,
  type NewznabCaps,
  type NewznabItem,
  type NewznabParams,
} from './newznab.js';

export type { NewznabCaps, NewznabItem, NewznabParams };
export { IndexerRequestError };

export type ApiKeyLookup = (indexerId: string) => string | undefined;

export class MissingApiKeyError extends Error {
  override name = 'MissingApiKeyError';
  constructor(public readonly envName: string) {
    super(`Set ${envName} in the broker environment`);
  }
}

/**
 * The single door to the indexers. Every method spends from the budget first
 * and throws BudgetExhaustedError without calling out when there is none.
 */
export class IndexerGateway {
  constructor(
    private readonly client: NewznabClient,
    private readonly budget: IndexerBudget,
    private readonly indexers: IndexerRepository,
    private readonly apiKey: ApiKeyLookup,
    private readonly envName: (id: string) => string,
  ) {}

  private endpoint(indexer: Indexer) {
    const apiKey = this.apiKey(indexer.id);
    if (!apiKey) throw new MissingApiKeyError(this.envName(indexer.id));
    return { url: indexer.url, apiKey };
  }

  /** When this indexer can search again (no call). */
  nextFreeSearch(indexer: Indexer): Date {
    return this.budget.status(indexer.id, 'search').nextFreeAt;
  }

  /** One search call (costs one search). */
  async search(indexer: Indexer, params: NewznabParams): Promise<NewznabItem[]> {
    const endpoint = this.endpoint(indexer);
    return this.budget.spend(indexer.id, 'search', () => this.client.search(endpoint, params));
  }

  /** Reads and caches `t=caps` (costs one search, once per indexer). */
  async caps(indexer: Indexer): Promise<NewznabCaps> {
    const endpoint = this.endpoint(indexer);
    const caps = await this.budget.spend(indexer.id, 'search', () => this.client.caps(endpoint));
    this.indexers.setCaps(indexer.id, JSON.stringify(caps));
    return caps;
  }

  /** Downloads one NZB (costs one grab). */
  async grab(indexer: Indexer, guid: string): Promise<Buffer> {
    const endpoint = this.endpoint(indexer);
    return this.budget.spend(indexer.id, 'grab', () => this.client.nzb(endpoint, guid));
  }
}

export interface GatewayDeps {
  budget: IndexerBudget;
  indexers: IndexerRepository;
  /** Usually process.env: keys are read as INDEXER_<ID>_API_KEY. */
  env: NodeJS.ProcessEnv;
  clock: Clock;
  fetch?: FetchLike;
}

/** Builds the gateway; the only place a Newznab client is created. */
export function createIndexerGateway(deps: GatewayDeps): IndexerGateway {
  const fetchFn: FetchLike = deps.fetch ?? globalThis.fetch.bind(globalThis);
  return new IndexerGateway(
    new NewznabClient(fetchFn, deps.clock),
    deps.budget,
    deps.indexers,
    (id) => deps.env[IndexerRepository.apiKeyEnvName(id)],
    IndexerRepository.apiKeyEnvName,
  );
}
