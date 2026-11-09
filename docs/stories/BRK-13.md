# BRK-13 Tell the app when a book will be hard to find

Status: done
Milestone: 11
Depends on: BRK-05

## Story

As a reader, I want the broker to warn me before Add when a search is
unlikely to find a book,
so that I don't spend scarce searches on a book that isn't out there.

## Acceptance criteria

- [x] `GET /requests/preview?workId=&language=` answers `{ workId, language, lowOdds }`, where `lowOdds` is null or the one strongest reason as a code
- [x] Reasons, strongest first: `LOW_ODDS_NOT_FOUND` (a request for this work ended "not found" in the last 30 days, with the date), `LOW_ODDS_NO_MATCH` (no ISBN or edition), `LOW_ODDS_NEW` (published in the last 14 days or not yet), `LOW_ODDS_LANGUAGE` (chosen language is not English, with the English edition when one is known), `LOW_ODDS_RARE` (fewer than 10 Hardcover readers)
- [x] A book already in the library gets no warning
- [x] Working it out uses only metadata and the requests table: no indexer call, and the zero-indexer test covers the new module
- [x] Tests first; the decision rules have 100% coverage

## Design

Canvas boards: 3b · Add sheet: Dutch book warning, 3c · Low odds warning:
all reasons — [`docs/design/add-sheet.md`](../design/add-sheet.md)

## Notes / decisions

See [ADR 0041](../decisions/0041-low-odds-warning.md).
