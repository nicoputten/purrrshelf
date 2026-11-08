# 0005. Searching: only when a user adds a book, within a visible hourly budget

Status: accepted, window superseded by 0025
Date: 2026-11-08

## Context

The indexer allows about 25 API calls an hour. Every search must count.

## Decision

The indexer is searched only when a user taps Add, never in the background. Each indexer has a rolling 60-minute budget for searches and grabs, persisted in the database and shown in the app wherever a search is about to be spent. When the budget is empty the request waits (`waiting_budget`) and runs when a slot frees up; that is the only automatic search.

## Consequences

- All indexer calls go through the budget module; tests enforce this.
- Metadata search is free and cached, and the UI makes the difference obvious.
- Query variants are ordered by measured hit rate to save calls.
