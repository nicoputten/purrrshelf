# BRK-09 Import the existing Calibre library

Status: done
Milestone: 6
Depends on: BRK-03

## Story

As a household, I want to import our existing Calibre library and say who owns each book,
so that the app starts with everything we already have.

## Acceptance criteria

- [x] `POST /admin/import` scans `metadata.db` and matches books to works
- [x] A review screen assigns each book to me, partner or both (bulk and per book)
- [x] Re-running the import is safe

## Design

Not on the canvas yet. See [import.md](../design/import.md).

## Notes / decisions

See [ADR 0023](../decisions/0023-library-import.md).

- `POST /admin/import` reads `metadata.db` page by page and gives every
  Calibre book a library item, then matches books without a work to one in
  the background (metadata search: same ISBN, else same title and first
  author). `GET /admin/import` reports progress and lists the readers.
- Re-running keeps items, owners and matched works; only books still without
  a work are searched again. One run at a time.
- `PUT /admin/import/owners` sets the owners of one or many books, replacing
  what was there; Kobo shelves are not touched.
- There is no admin role yet, so any signed-in reader can run the import.
- The review screen is reached from Settings → Library.
