# BRK-02 Search book metadata from three providers

Status: done
Milestone: 2
Depends on: BRK-01

## Story

As a reader, I want search by title (author optional) across Hardcover, Open Library and Google Books,
so that I find the right book and edition without spending any indexer calls.

## Acceptance criteria

- [x] `GET /discover/search` queries Hardcover first, then Open Library and Google Books
- [x] Results are merged and de-duplicated by ISBN, then by normalised title + author
- [x] Each hit says whether it is already in the library and who owns it
- [x] Provider responses are cached for 7 days
- [x] Zero indexer calls on any discover endpoint (test enforced)
- [x] `GET /works/:id` and `GET /works/:id/series` return detail and series
- [x] The broker warns before the Hardcover token expires

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0007](../decisions/0007-metadata-providers.md) and
[ADR 0018](../decisions/0018-work-ids-and-metadata-merge.md).

- Providers are asked in parallel and merged in priority order; one failing
  provider is reported per hit list, not as an error.
- The Hardcover token warning is the `hardcover-token` health check (degraded
  from `HARDCOVER_TOKEN_WARN_DAYS` before expiry) plus a log line at start-up.
- Library state comes from a `LibraryLookup`; until library items and
  ownership exist (milestone 5) every hit has `library: null`.
