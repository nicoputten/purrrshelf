# BRK-19 Undo a wrong book and search again

Status: in review
Milestone: 12
Depends on: BRK-08, BRK-18

## Story

As a reader, I want to say a delivered book is the wrong one, so that it
leaves the Kobos and the library and I can search again without asking for
help on the server.

## Acceptance criteria

- [x] `POST /requests/:id/wrong-book` with `{ then }` works for a request that is `in_library` or `pushed`; otherwise `REQUEST_STATE`
- [x] The book comes off the Kobo shelf of every reader who owns it (a missing shelf or Kobo link is skipped)
- [x] A book this request imported is deleted from the library and its library item is forgotten
- [x] A book that was already in the library is only removed from my library, never deleted
- [x] The grabbed release is marked failed, so it is never picked again for this request
- [x] `then: "search_myself"` leaves the request in `choose_release` with the earlier results; `"search_again"` starts a paid round that skips the library check; `"remove_only"` cancels the request
- [x] If CWA refuses the Kobo or delete step, nothing else changes and the error is answered
- [x] Tests first; the status machine stays at 100% coverage

## Design

Canvas boards: 16c · Wrong book?, 16d · Where the advanced paths live —
[book-detail.md](../design/book-detail.md)

## Notes / decisions

[ADR 0048](../decisions/0048-search-it-yourself-and-wrong-book.md). Before this,
a wrong book (BRK-15, BRK-16) had to be removed by hand: ownership rows,
`work_id`, the cleanup job.
