# 0034. The one-time library import is removed

Status: accepted
Date: 2026-11-09

## Context

ADR 0023 added an import (BRK-09) that brought the household's existing
Calibre library into Purrshelf: every Calibre book got a library item, books
were matched to works, and a review screen in Settings set who owns each
book. The import has run on the household's server and every book has its
owners. Nobody will run it again: new books reach the library through
requests, and the lookups in search and delivery already give a Calibre book
an item when they meet it.

Keeping the feature costs a Settings button nobody should press, three API
routes, a background matcher and their tests and translations.

## Decision

- Remove the import: `POST /admin/import`, `GET /admin/import` and
  `PUT /admin/import/owners` with their contract schemas, the broker's
  `LibraryImport`, the matcher it used (`DiscoverService.matchWork`) and the
  bulk owner update (`LibraryItems.setOwners`, `byIds`, `byCalibreIds`).
- Remove the app's import screen and route, the Library section in Settings
  and their `en` and `nl` strings.
- **Keep what the import produced.** No migration: library items, matched
  works and owners stay as they are in the database.
- BRK-09 is marked retired, not deleted, so its history stays readable.

## Consequences

- An app older than this change still shows the import button; pressing it on
  a newer broker gets `404 NOT_FOUND`.
- If a library ever needs bringing in again (a new household, a move to
  Grimmory), it gets a new story and ADR rather than reviving this one.
