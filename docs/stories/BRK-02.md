# BRK-02 Search book metadata from three providers

Status: todo
Milestone: 2
Depends on: BRK-01

## Story

As a reader, I want search by title (author optional) across Hardcover, Open Library and Google Books,
so that I find the right book and edition without spending any indexer calls.

## Acceptance criteria

- [ ] `GET /discover/search` queries Hardcover first, then Open Library and Google Books
- [ ] Results are merged and de-duplicated by ISBN, then by normalised title + author
- [ ] Each hit says whether it is already in the library and who owns it
- [ ] Provider responses are cached for 7 days
- [ ] Zero indexer calls on any discover endpoint (test enforced)
- [ ] `GET /works/:id` and `GET /works/:id/series` return detail and series
- [ ] The broker warns before the Hardcover token expires

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0007](../decisions/0007-metadata-providers.md).
