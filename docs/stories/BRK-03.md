# BRK-03 Read and change Kobo shelves through CWA

Status: done
Milestone: 3
Depends on: SRV-02, BRK-01

## Story

As a broker, I want a `LibraryAdapter` with a CWA implementation,
so that the rest of the broker never depends on CWA's web forms directly.

## Acceptance criteria

- [x] `LibraryAdapter` interface: findBooks, getBook, addToKoboShelf, removeFromKoboShelf, getDeviceState, getReadingState, deleteBook
- [x] `CwaAdapter` logs in as the service account (`CWA_SERVICE_USER`, session cookie + CSRF token from the login form)
- [x] Each user's Kobo shelf ID is resolved at runtime by owner + `CWA_KOBO_SHELF_NAME`; no shelf IDs are configured or hard-coded; a missing shelf is a clear error
- [x] Reads `metadata.db` and CWA's `app.db` read-only
- [x] Contract tests run in CI against `crocodilestick/calibre-web-automated:v4.0.8` (the version on the server)
- [x] A fixture recreates the server setup: two non-admin readers with download permission and selected-shelves sync on, one private `Kobo` shelf each with Kobo sync on, plus the service account; fixture passwords meet CWA's policy
- [ ] Before this story: the service account exists on the server (manual; download + delete books rights only, see ADR 0021)

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0003](../decisions/0003-cwa-as-library.md) and [ADR 0017](../decisions/0017-cwa-setup-contract.md). Biggest risk in the project: CWA has no official API.

Built against the pinned image, which showed that CWA lets nobody but the
owner change a private shelf. Shelf changes therefore go through each
reader's Kobo sync API with their own Kobo token; the service account only
deletes books ([ADR 0021](../decisions/0021-shelf-edits-via-kobo-api.md)).

- Code: `apps/broker/src/modules/library/` (`LibraryAdapter` in `types.ts`,
  `CwaAdapter`, read-only `CalibreDb` and `CwaAppDb`, `CwaWebSession` and
  `CwaKoboApi`).
- Unit tests with a fake CWA: `apps/broker/test/library/` (100% coverage).
- Contract tests and fixture: `apps/broker/test/contract/`, run by the
  "CWA contract tests" CI job on `test/stack/docker-compose.yml`.
- The library is off unless `CWA_BASE_URL` is set; when on, `/health` has a
  `library` check.
