# APP-07 Browse my, my partner's and all books

Status: done
Milestone: 5
Depends on: BRK-03

## Story

As a reader, I want to browse my books, my partner's and all books,
so that I can see what we have and borrow from the other's shelf.

## Acceptance criteria

- [x] Tabs: Mine / Partner's / All with counts
- [x] Sort and filters: recently added, unread, on my Kobo, series
- [x] Cover grid with Kobo and "Both" badges and reading progress
- [x] Library is readable offline

## Design

Canvas board: 6 · Library — `docs/design/library.md`

## Notes / decisions

- `GET /library/books` returns the whole shared library in one go: owners,
  whether each book is on my Kobo and my progress from my Kobo. The app
  splits it into Mine / Partner's / All and sorts and filters on the phone,
  so it works the same offline.
- "Partner's" means owned by any other reader; "Both" means owned by me and
  someone else. "Unread" includes books without progress.
- Offline: the last answer is kept in AsyncStorage (`purrshelf.offline.library`;
  secure storage is too small for it) and shown with an offline note when the
  broker can't be reached. It is cleared on logout.
- A Calibre book that no search hit has matched yet has no work id, so it
  shows with a placeholder cover and does not open a book page.
- Filters redone on 2026-11-09 (ADR 0034): a segmented Mine / Partner's /
  All row, then one "Recently added ▾" dropdown holding the views, so the
  filters are always two rows.
