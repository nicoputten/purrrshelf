# Changes to the build plan

The build plan document is the original handover. Changes decided later are
recorded here and in the linked ADRs; where they differ, this file and the
ADRs win.

## 2026-11-08: milestone 0 done (server setup)

- **Library server:** Calibre-Web-Automated v4.0.8 (TrueNAS community app).
  Calibre desktop, Calibre-Web and Bookshelf are retired. → ADR 0017,
  `deploy/truenas.md`.
- **Formats:** the requirement "Auto-convert to KEPUB" is replaced. CWA's
  auto-convert target is EPUB, the library stores EPUB, and CWA's kepubify
  makes KEPUB at Kobo sync time. The broker never converts to KEPUB. → ADR 0016.
- **CWA setup the adapter relies on:** readers are non-admin users with
  selected-shelves sync; each owns a private `Kobo` shelf whose ID is looked up
  per user at runtime; CWA runs as UID/GID 568; paths `/calibre-library` and
  `/cwa-book-ingest`; CSRF login and a password policy. → ADR 0017.
- **Broker volumes:** the ingest dataset is mounted in the broker at
  `/cwa-book-ingest` (was `/ingest`), and the broker runs as 568:568.
- **Config:** `CWA_BASE_URL`, `CWA_SERVICE_USER`, `CWA_SERVICE_PASSWORD`,
  `CWA_KOBO_SHELF_NAME`, `CWA_INGEST_PATH`, `CALIBRE_LIBRARY_PATH` in
  `.env.example` (placeholders). The service account is created by hand before
  milestone 3.
- **Integration tests:** the test stack pins the same CWA image; a fixture
  recreates two readers with selected-shelves sync and one `Kobo` shelf each
  (`test/stack/`).
- **Moved out of milestone 0:** the broker's CWA service account (before
  milestone 3) and the SABnzbd `kobopush` category and API key (before
  milestone 4).

## 2026-11-08: OPS-02 ahead of milestone 8

- **Remote access** (OPS-02) is done in parallel with milestone 2 instead of in
  milestone 8: one NPM proxy host for the broker, HTTPS with HSTS
  (`deploy/reverse-proxy.md`). Kobo sync stays on the home Wi-Fi.
- **Client IPs:** the broker trusts `X-Forwarded-For` only from the proxy
  (`TRUST_PROXY`, default private networks). → ADR 0018.

## 2026-11-08: BRK-03 (CWA adapter)

- **Shelf changes** go through each reader's Kobo sync API with their own
  Kobo token, because CWA lets only the owner change a private shelf. The
  service account needs only download and delete-books rights, not "rights
  to edit other users' shelves". → ADR 0021, `deploy/truenas.md`.
- **Readers need a Kobo token** (generated in CWA) before the app can put a
  book on their shelf; a missing one is the `KOBO_SYNC_NOT_SET_UP` error.
- **New error codes:** `LIBRARY_UNAVAILABLE`, `KOBO_SHELF_MISSING`,
  `KOBO_SYNC_NOT_SET_UP` (translated in the app).
