# 0048. Search it yourself, and undo a wrong book

Status: accepted
Date: 2026-11-16

## Context

Some books are named oddly on usenet. "Atlas: The Story of Pa Salt" was
shared as `Atlas .The.Story.of.Pa.Salt`, without the author, so the automatic
query variants ("author title", title, ISBN) never found it, and one search
grabbed another book called "Atlas". ADR 0046 made matching stricter, but two
gaps stay:

- a reader who knows better words has no way to search with them;
- a wrong book that reached the Kobo can only be removed by hand in the
  broker database and CWA.

Showing a pick screen after every search was rejected (ADR 0046): it makes
every Add a three-tap job. Design boards 16, 16b, 16c and 16d add an opt-in
path instead.

## Decision

- **Search it yourself** (`POST /requests/:id/search`): the reader sends their
  own words and picks **one** indexer. That is one search, spent through the
  budget module like any other (CLAUDE.md), recorded as a `manual` attempt.
  It never waits for budget: with no searches left the broker answers
  `BUDGET_EXHAUSTED` with the time a search frees up, and nothing is queued.
- Every release of a manual search is stored, and the request goes to
  `choose_release`. The broker never grabs on its own after a manual search:
  the reader chose the words, so the reader picks. Releases the scorer would
  reject ("another book") are shown with their reason and can still be
  picked. A search with no results leaves the request as it was.
- `GET /requests/:id/searches` lists what was searched for this request
  (words, indexer, number of results). It reads the database only.
- **Add without a search**: `POST /requests` takes `search: "manual"`, which
  creates the request in `choose_release` with no releases and spends nothing,
  so the reader can go straight to their own words (Add sheet, only when a
  low-odds warning shows).
- **Wrong book** (`POST /requests/:id/wrong-book`) is allowed when a request
  is `in_library` or `pushed`:
  - the book comes off the Kobo shelf of every reader who owns it;
  - if this request imported the book (it has a grabbed release), it is
    deleted from the library at once and its library item is forgotten;
    a book that was already in the library before the request only stops
    being mine (as Remove from my library), because it may be right for
    someone else;
  - the grabbed release is marked failed, so it is never picked again for
    this request;
  - then the request goes on as the reader chose: `search_myself`
    (`choose_release`, with the earlier results still there),
    `search_again` (a new paid round, like Try again, that skips the library
    check) or `remove_only` (`cancelled`).
- The status machine gains `in_library`/`pushed` → `searching`,
  `choose_release` and `cancelled`, only for this action.

## Consequences

- Two new error codes: `BUDGET_EXHAUSTED` (details hold `nextFreeAt`) and
  `INDEXER_UNAVAILABLE` (the indexer is unknown, switched off or answered
  with an error).
- Manual attempts don't count towards the hit rate of the automatic query
  variants: their variant is `manual`, which the planner never runs.
- Deleting a wrong book needs the CWA service account's delete right, which
  it already has for the daily cleanup (BRK-08).
- Nothing here runs on a timer, so the only automatic search stays the
  `waiting_budget` job.
