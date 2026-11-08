# 0027. Stop grabbing when an indexer refuses the same way twice

Status: accepted
Date: 2026-11-08

## Context

When an NZB can't be fetched, the pipeline tries the next-best release from
the same search (BRK-06). On the first real request the indexer answered
"Indexer error 300: No such item" for every release, because of a bug in how
the broker read its release ids. The pipeline walked the whole list in half a
second and spent 6 of the day's 25 grabs on one error that was never going to
go away.

## Decision

- A Newznab error document (`<error code="…">`) means the indexer understood
  the call and refused it. The broker keeps the code on `IndexerRequestError`.
- If the same indexer refuses two grabs in a row with the same code, the
  pipeline stops asking that indexer for this request. Releases from other
  indexers can still be tried. With one indexer, the request ends as
  `download_failed` with the error and "Stopped asking … so no more downloads
  are spent".
- Codes 100–199 (wrong key, suspended account, no rights) stop it after the
  first grab: every other grab would fail the same way.
- Network errors, HTTP errors and replies that aren't an NZB carry no code, so
  they keep the old behaviour (try the next release). A different code, or a
  success in between, starts the count again.
- A failed grab still counts against the budget, because the call went out
  (ADR 0005).

## Consequences

- A systematic grab error costs at most two grabs per request, not the whole
  list.
- The user can still pick another release by hand. That spends a grab on
  purpose.
