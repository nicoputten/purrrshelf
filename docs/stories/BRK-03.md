# BRK-03 Read and change Kobo shelves through CWA

Status: todo
Milestone: 3
Depends on: SRV-02, BRK-01

## Story

As a broker, I want a `LibraryAdapter` with a CWA implementation,
so that the rest of the broker never depends on CWA's web forms directly.

## Acceptance criteria

- [ ] `LibraryAdapter` interface: findBooks, getBook, addToKoboShelf, removeFromKoboShelf, getDeviceState, getReadingState, deleteBook
- [ ] `CwaAdapter` logs in as the service account (`CWA_SERVICE_USER`, session cookie + CSRF token from the login form)
- [ ] Each user's Kobo shelf ID is resolved at runtime by owner + `CWA_KOBO_SHELF_NAME`; no shelf IDs are configured or hard-coded; a missing shelf is a clear error
- [ ] Reads `metadata.db` and CWA's `app.db` read-only
- [ ] Contract tests run in CI against `crocodilestick/calibre-web-automated:v4.0.8` (the version on the server)
- [ ] A fixture recreates the server setup: two non-admin readers with download permission and selected-shelves sync on, one private `Kobo` shelf each with Kobo sync on, plus the service account; fixture passwords meet CWA's policy
- [ ] Before this story: the service account exists on the server (manual)

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0003](../decisions/0003-cwa-as-library.md) and [ADR 0017](../decisions/0017-cwa-setup-contract.md). Biggest risk in the project: CWA has no official API.
