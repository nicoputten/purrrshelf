# 0038. The budget pill shows the scarcest indexer

Status: accepted
Date: 2026-11-09

## Context

`GET /budget` reported `searches.limit` and `searches.left` as sums over all
indexers. With one indexer that was fine. After a second indexer with a large
limit was added, the pill read "281 / 300 left" while the first indexer, which
is always asked first, had only 81 of 100 searches left. The sum hid the
budget that actually runs out.

## Decision

- `searches.limit` and `searches.left` come from the active indexer (limit
  above 0) with the fewest searches left; on a tie, the smaller limit.
- `searches.nextFreeAt` stays the earliest moment any indexer can search.
- Per-indexer counters in `indexers` are unchanged.

## Consequences

- The pill warns as soon as any indexer runs low, even when another still has
  plenty. That errs on the side of caution, which is what the pill is for.
- The Add sheet's "this can cost up to N searches" check compares against the
  same, tighter number.
