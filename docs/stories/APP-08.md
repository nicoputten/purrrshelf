# APP-08 See reading progress from the Kobo

Status: in review
Milestone: 7
Depends on: BRK-03

## Story

As a reader, I want to see how far I am in each book,
so that I know what I'm reading and what I've finished.

## Acceptance criteria

- [x] Progress and finished state read from CWA's Kobo sync data
- [x] Progress shown on library covers and the book page

## Design

Canvas boards: 2 · Book detail, 6 · Library

## Notes / decisions

- The broker reads each reader's progress from CWA's `app.db`: the read
  status in `book_read_link` and the Kobo's last position in
  `kobo_bookmark.progress_percent` (both written by CWA's Kobo sync). Nothing
  is asked of the Kobo itself.
- Library covers got it in APP-07 (`GET /library/books`, `reading`). The book
  page gets it through `library.reading` on work details (and search hits),
  which is null when my Kobo is not linked or CWA cannot be read; search keeps
  working then.
- The book page shows "You've read 42%" with a bar and a paw thumb, "You've
  finished this one" with a full bar, "You're reading this one" without a
  position, and nothing for an unread book.
