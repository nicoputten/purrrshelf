# BRK-12 Get genre top 10s for each reader

Status: done
Milestone: 11
Depends on: BRK-02, BRK-11

## Story

As a reader, I want to see what's popular right now in the genres I like,
in my own language, so that I can find my next book without knowing what to
search for, and without spending searches.

## Acceptance criteria

- [x] A `charts` module that reads only the Apple Books charts and the metadata providers; a test proves it has no path to indexers, the budget, search or downloads, and that `/charts` only calls Apple and metadata hosts
- [x] `GET /charts` answers top 10s for `all` and per genre (thriller, romance, literary, historical, fantasy & sci-fi, biography, non-fiction) from the Apple Books NL and US ebook charts (the reader's own language first) and Hardcover trending; a genre with no books is left out
- [x] Every entry has its rank in the list, title and authors as the chart names them, the matched work (or `null` when no provider knows it), fresh library state and my open request
- [x] Hardcover trending is left out when the server has no Hardcover token or Hardcover fails
- [x] A chart is fetched at most once a day, when someone looks (no timer); the same chart is never fetched twice at once; the last good chart is served `stale` when a source is down, and `METADATA_UNAVAILABLE` when there is nothing to show
- [x] All of it in the shared contract (Zod + OpenAPI); tests use invented or public-domain books

## Design

Not designed yet: a brief for the designer is out. The app story follows
once the boards are in.

## Notes / decisions

See [ADR 0039](../decisions/0039-genre-top-10s.md) for the sources we looked
at (Hardcover, Apple Books, NYT, Bol.com, CPNB) and why.

- Module `apps/broker/src/modules/charts/`: `apple.ts` (feed reader),
  `genres.ts` (pure: Apple genre ids and Hardcover tags to chart genres,
  lists per genre), `ChartService`, routes.
- The Hardcover provider got `trending()` (`books_trending`, then one
  `books` query for the ids); the discover module got `trending()` and
  `summary()`, and caches every trending book as a work so its book page
  needs no extra lookup.
- Charts are cached in the metadata cache table (`charts:<source>:<region>`),
  so no migration.

- 2026-11-09, after release: Apple's feed is flaky from the home server
  (random 502s, and hangs that end in a 504 after 30 seconds). The broker
  now tries each Apple chart up to 6 times, 6 seconds a try
  (`APPLE_ATTEMPTS`, `APPLE_TRY_MS` in `modules/charts/apple.ts`).
