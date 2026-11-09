# BRK-11 Work out book suggestions for each reader

Status: in review
Milestone: 10
Depends on: BRK-02, BRK-03, BRK-08, APP-09

## Story

As a reader, I want the broker to pick books for me from what I finish,
so that I find my next read without searching and without spending searches.

## Acceptance criteria

- [x] A `recommend` module that reads only the library and the metadata providers; a test proves it has no path to indexers, the budget, search, releases or downloads, and that `/recommendations` only calls metadata hosts
- [x] The library reads tags and languages per book and every reading state of a reader in one query
- [x] `GET /recommendations` answers up to three non-empty rows of at most 10: next in my series, more from authors I read, and one row per other reader's shelf, each book with a reason, a "New" flag, fresh library state and my open request
- [x] Suggestions leave out books I own, books I hid and languages I don't read; a book shows in one row only
- [x] `POST /recommendations/:workId/dismiss` with `kind: book` (for good) or `kind: author` (fewer for 90 days), and `DELETE` on the same path to undo
- [x] Series and author rows are cached per reader for 24 hours or until the books I finish change; when the providers are down the last rows come back marked `stale`, or `METADATA_UNAVAILABLE` with nothing to show
- [x] Without a linked Kobo, rows come from owned books and the answer says `readingData: false`
- [x] All of it in the shared contract (Zod + OpenAPI); tests use invented books

## Design

Canvas boards: 10 · For you (Search tab, ready), 12 · For you states —
[`docs/design/for-you.md`](../design/for-you.md)

## Notes / decisions

See [ADR 0035](../decisions/0035-recommendations-for-you.md).

- Story numbers: the handover named this BRK-10 and the app stories APP-10
  and APP-11, but those IDs were already used by the in-app updater
  (milestone 9), so For you is BRK-11, APP-12 and APP-13.
- Module `apps/broker/src/modules/recommend/`: `ReaderShelf` (a reader's
  books, Calibre metadata and reading state in bulk), `seeds.ts` (pure:
  what counts, languages, series and author seeds, fingerprint),
  `RecommendService`, the dismissal and row stores (migration 0007), routes.
- The discover module got `byAuthor` (metadata only, throws
  `METADATA_UNAVAILABLE` when no provider answered); similar books use the
  same lookup.
- The contract client now takes body fields and path params in one object
  for endpoints that have both (the dismiss endpoint is the first).
- The reason carries facts, not text: the app writes "Seven Sisters 6 ·
  you're reading 5" or "You finished 3 books by this author" in English and
  Dutch. Author pronouns are not known, so the app should not use "him"/"her".
