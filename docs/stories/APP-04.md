# APP-04 See book details, series and owners

Status: done
Milestone: 2
Depends on: BRK-02

## Story

As a reader, I want a book page with cover, description, series, owners and device state,
so that I can decide what to do with it in one place.

## Acceptance criteria

- [x] Cover, title, author, series position, language and format
- [x] Owner badges (Yours, Partner's)
- [x] My reading progress (APP-08)
- [x] Kobo row with my device state
- [x] Partner's Kobo row and Send / Remove actions (APP-06)
- [x] Series list with This book / In library / Add / Add next labels
- [x] Add / Add next as actions (APP-03, the Add sheet)
- [x] Similar books row (filled by APP-09)

## Design

Canvas board: 2 · Book detail — `docs/design/book-detail.md`

## Notes / decisions

Milestone 2 builds the screen with the data the broker has today: work
details and series (BRK-02), covers (BRK-07) and `library` on a work (empty
until library items exist). The open items above need later stories; this
story is done when they are wired.
