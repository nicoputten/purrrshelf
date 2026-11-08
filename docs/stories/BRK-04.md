# BRK-04 Track the indexer budget per hour

Status: todo
Milestone: 4
Depends on: BRK-01

## Story

As a household, I want a visible hourly budget per indexer,
so that we never exceed the indexer's limits.

## Acceptance criteria

- [ ] Rolling 60-minute window per indexer, persisted in `budget_events`
- [ ] Separate counters for searches and NZB grabs
- [ ] The indexer's own limit-reached error also stops spending
- [ ] `GET /budget` returns searches left and the next free slot
- [ ] 100% test coverage

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0005](../decisions/0005-search-only-on-add.md).
