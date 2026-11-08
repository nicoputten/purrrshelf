# BRK-08 Delete books nobody owns after 7 days

Status: todo
Milestone: 5
Depends on: BRK-03

## Story

As a household, I want a book to be deleted only when neither of us owns it, after a grace period,
so that nobody loses a book the other still wants.

## Acceptance criteria

- [ ] Removing from my library also removes it from my Kobo shelf
- [ ] No owners left → `delete_after` set to 7 days later; undo possible until then
- [ ] A daily job deletes expired items through the LibraryAdapter

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0009](../decisions/0009-shared-library-ownership.md).
