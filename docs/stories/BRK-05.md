# BRK-05 Search the indexer only when a book is added

Status: done
Milestone: 4
Depends on: BRK-04

## Story

As a household, I want indexer searches to happen only when one of us taps Add,
so that the scarce budget is never spent in the background.

## Acceptance criteria

- [x] Library check first: a book we already have costs 0 calls
- [x] Query variants in order of expected success, stopping at the first acceptable hit
- [x] Several indexers are queried in priority order, never in parallel
- [x] Empty budget → `waiting_budget`, run automatically when a slot frees up (the only automatic search)
- [x] Each attempt is recorded in `search_attempts`; variant order adapts by hit rate
- [x] Tests prove no code path reaches an indexer without the budget module

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0004](../decisions/0004-direct-newznab-and-sabnzbd.md) and [ADR 0005](../decisions/0005-search-only-on-add.md).

How it is built:

- `IndexerGateway` (`apps/broker/src/modules/budget/gateway.ts`) is the only
  user of the Newznab client, and every method spends from the budget before
  it calls out. `test/budget-safety.test.ts` checks the import graph (only the
  gateway imports the client; only the downloads wiring and the admin CLI build
  a gateway), that every client call in the gateway is wrapped in
  `budget.spend`, that no other file sets timers, and that the running broker
  has exactly one job type.
- The planner (`modules/search/planner.ts`) builds up to four variants:
  `t=book` (only when `purrshelf indexer caps <id>` has shown the indexer
  supports it), author + title, cleaned title, ISBN-13. They are ordered by
  Laplace-smoothed hit rate from `search_attempts`, default order on ties.
- Indexers are tried in priority order; a missing key, an indexer error or the
  indexer's own limit error moves on to the next indexer. A search limit of 0
  switches an indexer off.
- Empty budget: the request goes to `waiting_budget` and one
  `resume_waiting_budget_search` job is scheduled for the earliest free slot.
  When it runs it skips the variant/indexer pairs already spent in this round.
  Failed jobs are kept and never retried.
- Until release scoring (BRK-06), a hit means every word of the cleaned title
  is in the release name, and a found request stops at `choose_release`. All
  results are stored in `releases`; a new search replaces candidates but keeps
  failed releases.
- The status machine (`modules/requests/status.ts`) follows the build plan,
  plus `cancelled` for `DELETE /requests/:id`.
- The library check takes a `bookLookup`; until BRK-03 it finds nothing. No
  HTTP endpoint creates requests yet; `POST /requests` arrives with APP-03.
