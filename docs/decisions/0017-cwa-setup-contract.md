# 0017. The CWA setup the broker relies on

Status: accepted (service-account shelf rights superseded by [0021](0021-shelf-edits-via-kobo-api.md))
Date: 2026-11-08

## Context

Milestone 0 is done: the library server is Calibre-Web-Automated **v4.0.8**
(TrueNAS community app). Calibre desktop, Calibre-Web and Bookshelf are
retired. The `CwaAdapter` (BRK-03) talks to CWA through its web UI, so it needs
a fixed description of how CWA is set up.

## Decision

The adapter and the integration tests assume exactly this setup:

- **Version:** CWA v4.0.8, pinned in the test stack. Upgrading CWA means
  bumping the pin and getting the contract tests green first.
- **Kobo sync:** enabled globally, "proxy unknown requests to Kobo Store" on,
  external port set to match the published port.
- **Readers:** each reader is a normal (non-admin) CWA user with download
  permission and "Sync only books in selected shelves with Kobo" on.
- **Kobo shelves:** each reader owns one private shelf named by
  `CWA_KOBO_SHELF_NAME` (default `Kobo`) with "Sync this shelf with Kobo
  device" on. Shelves are per owner, so the adapter **resolves shelf IDs per
  user at runtime** (owner + name) and never hard-codes or configures IDs.
  `users.kobo_shelf_id` is only a cache of that lookup.
- **Service account:** the broker logs in as a separate CWA account
  (`CWA_SERVICE_USER`), created by hand before milestone 3, with the rights
  needed to edit other users' shelves and delete books.
- **Login:** the login form uses a CSRF token; the adapter fetches it before
  posting. The password policy is on (at least 8 characters with upper case,
  lower case, a number and a special character), so test fixtures use
  passwords that satisfy it.
- **Paths:** inside the CWA container the library is `/calibre-library` and
  the ingest folder `/cwa-book-ingest`. CWA deletes files from ingest after
  processing. The broker mounts the same datasets at `CALIBRE_LIBRARY_PATH`
  (read-only) and `CWA_INGEST_PATH` (read-write).
- **File ownership:** CWA runs as UID/GID 568 (`apps`). Files the broker writes
  into ingest must be readable by that user: the broker container runs as
  568:568 on the server and writes files with mode 0644.

## Consequences

- The integration stack (`test/stack/`) runs the same pinned image and a
  fixture recreates this setup: two readers, selected-shelves sync on, one
  `Kobo` shelf each, plus the service account.
- A shelf that is missing or misnamed is reported as a clear broker error, not
  silently created.
