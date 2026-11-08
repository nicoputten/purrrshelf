# 0025. The indexer budget counts per day, not per hour

Status: accepted
Date: 2026-11-08

## Context

ADR 0005 gave each indexer a rolling 60-minute budget, based on a limit of
about 25 calls an hour. The indexer's real limits are per day: 100 API
requests (searches) and 25 NZB downloads (grabs). With an hourly window the
broker could spend up to 24 times the daily limit and then hit the indexer's
own limit errors.

## Decision

- The budget window is a rolling 24 hours (`BUDGET_WINDOW_MS`). A slot frees
  up exactly 24 hours after the call that used it. A rolling window never
  spends more than the cap inside any calendar day, whatever time the indexer
  resets its counters.
- Searches (API requests) and grabs (NZB downloads) keep separate counters,
  with limits per indexer stored as `search_limit_per_day` and
  `grab_limit_per_day` (migration 0006 renames the hourly columns; existing
  values are kept, so re-run `indexer add` with the daily limits).
- An indexer's own limit-reached error without a retry time now blocks that
  counter for 24 hours.
- `waiting_budget` and Try again are unchanged in logic: the resume job is
  scheduled for the next free slot, which can now be up to a day away. It is
  still the only automatic indexer call.
- `GET /budget` reports `windowMinutes: 1440`. The app says "left today"
  ("vandaag") in the budget pill and the Add sheet.
- Spent calls are kept for two days, then pruned.

## Consequences

- This supersedes the hourly window in ADR 0005; the rest of 0005 stands.
- A request that runs out of searches may wait until tomorrow; the Requests
  screen already shows it as waiting for a free search.
