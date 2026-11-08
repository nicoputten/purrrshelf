# BRK-08 Delete books nobody owns after 7 days

Status: done
Milestone: 5
Depends on: BRK-03

## Story

As a household, I want a book to be deleted only when neither of us owns it, after a grace period,
so that nobody loses a book the other still wants.

## Acceptance criteria

- [x] Removing from my library also removes it from my Kobo shelf
- [x] No owners left → `delete_after` set to 7 days later; undo possible until then
- [x] A daily job deletes expired items through the LibraryAdapter

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0009](../decisions/0009-shared-library-ownership.md).

- `DELETE /library/items/:itemId/owners/me` removes the book from my
  library: first off my Kobo shelf (skipped when my Kobo is not linked or set
  up; if CWA refuses, nothing changes), then my ownership. With no owners left
  `delete_after` is set to 7 days later. `PUT` on the same path keeps the
  book again, which also clears `delete_after` (the undo).
- The daily cleanup is a persisted job (`library_cleanup`) on its own job
  runner, because only the job runner may keep time (ADR 0004). Each run
  deletes every expired, still unowned book through `LibraryAdapter.deleteBook`
  and schedules the next run a day later, also after a failed run. A book CWA
  fails to delete is kept and tried again the next day; one already gone from
  Calibre is just forgotten. The first run is 5 minutes after start-up.
- Books nobody ever owned (found in Calibre by ISBN) have no `delete_after`
  and are never deleted.
