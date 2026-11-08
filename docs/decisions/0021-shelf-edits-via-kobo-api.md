# 0021. Shelf changes go through each reader's Kobo sync API

Status: accepted (supersedes the service-account shelf rights in [0017](0017-cwa-setup-contract.md))
Date: 2026-11-08

## Context

ADR 0017 assumed the broker's CWA service account could be given "the rights
to edit other users' shelves". While building BRK-03 against the pinned image
(CWA v4.0.8) it turned out no such right exists: CWA's shelf check
(`check_shelf_edit_permissions`) refuses any change to a private shelf by
anyone but its owner, admins included. The readers' `Kobo` shelves are
private, so the web UI can't change them as the service account.

CWA's Kobo sync API can: `POST /kobo/<token>/v1/library/tags/<shelf uuid>/items`
(and `…/items/delete`) adds or removes books on a shelf as the user who owns
the Kobo sync token. Every reader already has such a token, because their
Kobo syncs with it, and CWA stores it in `app.db` (`remote_auth_token`,
`token_type = 1`), which the broker already reads read-only.

## Decision

- **Shelf changes:** the `CwaAdapter` reads the owner's Kobo sync token and
  shelf uuid from `app.db` and calls the Kobo tag API as that owner. This is
  the same code path a Kobo uses when a reader edits a collection on the
  device. After the call it re-reads `app.db` to confirm the change.
- **Service account:** a normal CWA user with only **download** and
  **delete books** rights. It is used for deleting books through the web UI
  (`POST /ajax/delete/<id>` with session cookie and CSRF token). It is not an
  admin and needs no shelf rights.
- **Reads** (books, shelves, device and reading state) come straight from
  `metadata.db` and `app.db`, read-only, as before.
- **Missing pieces are errors, not fixes:** no shelf, two shelves with the
  name, or Kobo sync off on the shelf → `KOBO_SHELF_MISSING`; no Kobo token →
  `KOBO_SYNC_NOT_SET_UP`. The broker never creates shelves or tokens.

## Consequences

- A reader must have set up Kobo sync (generated their Kobo token) before the
  app can put books on their shelf. That is already part of the server setup.
- Kobo tokens are as sensitive as passwords. The broker keeps them in memory
  only, never logs them and keeps them out of error messages; the token sits
  in the URL path, so request URLs to CWA are not logged.
- If a reader regenerates their Kobo token, the broker picks up the new one on
  the next call, because it reads `app.db` every time.
- The contract tests check exactly this flow against the pinned image, so a
  CWA upgrade that changes the Kobo tag API fails CI before it reaches the
  server.
