# BRK-05 Search the indexer only when a book is added

Status: todo
Milestone: 4
Depends on: BRK-04

## Story

As a household, I want indexer searches to happen only when one of us taps Add,
so that the scarce budget is never spent in the background.

## Acceptance criteria

- [ ] Library check first: a book we already have costs 0 calls
- [ ] Query variants in order of expected success, stopping at the first acceptable hit
- [ ] Several indexers are queried in priority order, never in parallel
- [ ] Empty budget → `waiting_budget`, run automatically when a slot frees up (the only automatic search)
- [ ] Each attempt is recorded in `search_attempts`; variant order adapts by hit rate
- [ ] Tests prove no code path reaches an indexer without the budget module

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0004](../decisions/0004-direct-newznab-and-sabnzbd.md) and [ADR 0005](../decisions/0005-search-only-on-add.md).
