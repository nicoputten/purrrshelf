# BRK-03 Read and change Kobo shelves through CWA

Status: todo
Milestone: 3
Depends on: SRV-02, BRK-01

## Story

As a broker, I want a `LibraryAdapter` with a CWA implementation,
so that the rest of the broker never depends on CWA's web forms directly.

## Acceptance criteria

- [ ] `LibraryAdapter` interface: findBooks, getBook, addToKoboShelf, removeFromKoboShelf, getDeviceState, getReadingState, deleteBook
- [ ] `CwaAdapter` logs in as the service account (session cookie + CSRF token)
- [ ] Reads `metadata.db` and CWA's `app.db` read-only
- [ ] Contract tests run against a real, pinned CWA container in CI

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0003](../decisions/0003-cwa-as-library.md). Biggest risk in the project: CWA has no official API.
