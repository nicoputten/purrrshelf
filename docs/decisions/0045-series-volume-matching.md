# 0045. Reject releases of another book in the same series

Status: accepted
Date: 2026-11-13

## Context

Release scoring (ADR 0006, BRK-06) checks that the release name holds the
words of the book's title. When a series' first book is titled after the
series, every volume's release name holds those words, for example
`Author - [Series 05] - Fifth Title (epub)`. All volumes then score the same
and the one with the most grabs wins, so a reader who added book 1 got book
5 on their Kobo.

## Decision

- A request's search query keeps the work's series name and position from
  the metadata provider (Hardcover today). Older requests have none.
- `search/volume.ts` reads a volume from a release name: a number right after
  the series name (with an optional `Book`, `Vol`, `#`, `Deel`, `Boek` …), or
  a `Book 5` / `#5` / `Book Five` anywhere outside the book's own title. Two
  numbers joined by `-` or `to` are a range. Years (four digits) and numbers
  glued to letters (`1st`) don't count.
- When the query has a series position, a release with another position or
  a range is rejected as `title_mismatch`, both by the search judge (so the
  search goes on) and by scoring (so it is never grabbed). The app already
  translates that reason as "another book", so the API doesn't change.
- A release without a volume number is judged as before.

## Consequences

- The right volume wins even when another one is far more popular.
- An omnibus is never grabbed for a single book; a reader who wants one can
  still pick it by hand from Pick another (rejected releases stay listed).
- A release that names another volume only by its subtitle (no number) is
  still not caught; this needs the series' other titles and is left out.
- Nothing here calls an indexer.
