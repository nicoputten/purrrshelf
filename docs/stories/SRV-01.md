# SRV-01 Replace Calibre + Calibre-Web with CWA on the existing library

Status: done
Milestone: 0
Depends on: none

## Story

As a household admin, I want to run Calibre-Web-Automated on the existing Calibre library instead of Calibre and Calibre-Web,
so that the library, format conversion and Kobo sync live in one service the broker can drive.

## Acceptance criteria

- [x] Bookshelf is stopped and removed; Calibre desktop and Calibre-Web are retired
- [x] The Calibre library folder and the Calibre-Web `app.db` are backed up
- [x] CWA v4.0.8 (TrueNAS community app, UID/GID 568) runs on the existing library with `/config`, `/calibre-library` and `/cwa-book-ingest`, ingest on its own dataset
- [x] Kobo sync is on with "proxy unknown requests to Kobo Store" and the external port matching the published port
- [x] Auto-convert target is EPUB; KEPUB is made on the fly at sync time
- [ ] A CWA service account for the broker exists (moved: before milestone 3, see BRK-03)
- [ ] SABnzbd has a `kobopush` category and an API key for the broker (moved: before milestone 4, see BRK-06)

## Design

No canvas board (no UI).

## Notes / decisions

Done by hand on 2026-11-08. Steps and the resulting setup: `deploy/truenas.md`. See [ADR 0003](../decisions/0003-cwa-as-library.md), [ADR 0016](../decisions/0016-epub-in-library-kepub-at-sync.md) and [ADR 0017](../decisions/0017-cwa-setup-contract.md).
