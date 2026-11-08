# 0003. Library and Kobo sync: Calibre-Web-Automated behind an adapter

Status: accepted (format detail superseded by [0016](0016-epub-in-library-kepub-at-sync.md); setup in [0017](0017-cwa-setup-contract.md))
Date: 2026-11-08

## Context

Calibre desktop plus Calibre-Web needs manual work for ingest, KEPUB conversion and Kobo sync. Calibre-Web-Automated (CWA) does all three, but has no official REST API.

## Decision

Replace Calibre and Calibre-Web with CWA on the existing library. The broker talks to it only through a `LibraryAdapter` interface; `CwaAdapter` is the v1 implementation and uses the same endpoints as the web UI (session cookie + CSRF token).

## Consequences

- Contract tests run the adapter against a real, pinned CWA container in CI, so a form change fails a test instead of the app.
- A `GrimmoryAdapter` can replace it later without touching the rest of the broker.
- This is the project's biggest risk; pin the CWA version.
