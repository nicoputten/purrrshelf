# BRK-18 Search an indexer with my own words

Status: in review
Milestone: 12
Depends on: BRK-05, BRK-06, BRK-16

## Story

As a reader, I want to search one indexer with words I choose and pick the
result myself, so that I can still get a book whose release name the
automatic search doesn't guess.

## Acceptance criteria

- [x] `POST /requests/:id/search` with `{ words, indexerId }` spends exactly one search on that indexer, through the budget module, and records it as a `manual` attempt
- [x] With results, all of them are stored (replacing the earlier candidates; failed releases stay remembered) and the request goes to `choose_release`; nothing is grabbed
- [x] With no results the request stays as it was; the answer says 0 results
- [x] With no searches left the answer is `BUDGET_EXHAUSTED` with `nextFreeAt`; nothing is queued and no call goes out
- [x] An unknown or switched-off indexer, or an indexer error, answers `INDEXER_UNAVAILABLE`
- [x] Only allowed where Try again is (not found, choose release, failed download or import); otherwise `REQUEST_STATE`
- [x] `GET /requests/:id/searches` lists the words, indexer and result count of every search for the request, newest first, for free
- [x] `POST /requests` with `search: "manual"` makes the request in `choose_release` without searching
- [x] Manual attempts don't change the hit-rate order of the automatic variants
- [x] Tests first; the status machine and budget stay at 100% coverage

## Design

Canvas boards: 16 · Search it yourself, 16b · Pick from your own search,
16d · Where the advanced paths live — [release-picker.md](../design/release-picker.md)

## Notes / decisions

[ADR 0048](../decisions/0048-search-it-yourself-and-wrong-book.md).
