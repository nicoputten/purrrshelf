# BRK-04 Track the indexer budget per hour

Status: done
Milestone: 4
Depends on: BRK-01

## Story

As a household, I want a visible hourly budget per indexer,
so that we never exceed the indexer's limits.

## Acceptance criteria

- [x] Rolling 60-minute window per indexer, persisted in `budget_events`
- [x] Separate counters for searches and NZB grabs
- [x] The indexer's own limit-reached error also stops spending
- [x] `GET /budget` returns searches left and the next free slot
- [x] 100% test coverage

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0005](../decisions/0005-search-only-on-add.md).

- Module: `apps/broker/src/modules/budget/`. `IndexerBudget.spend(indexer, kind, call)`
  checks the window, records the call and only then runs it; a call that fails
  still counts. BRK-05 routes every indexer call through it.
- An indexer client throws `IndexerLimitReachedError` when the indexer says its
  limit is reached; that counter is then blocked (table `budget_blocks`) until the
  indexer's retry time, or for one full window.
- Indexers are added with `purrshelf indexer add <id> …` (URL and limits in the
  database); the key stays in env as `INDEXER_<ID>_API_KEY`.
- `budget_events` older than a day are pruned on each spend.
