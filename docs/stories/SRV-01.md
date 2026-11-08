# SRV-01 Replace Calibre + Calibre-Web with CWA on the existing library

Status: todo
Milestone: 0
Depends on: none

## Story

As a household admin, I want to run Calibre-Web-Automated on the existing Calibre library instead of Calibre and Calibre-Web,
so that the library, KEPUB conversion and Kobo sync live in one service the broker can drive.

## Acceptance criteria

- [ ] Bookshelf is stopped before anything else changes
- [ ] The Calibre library folder and the Calibre-Web `app.db` are backed up
- [ ] CWA runs on the existing library with `/config`, `/calibre-library` and `/cwa-book-ingest` mounted, ingest on its own dataset
- [ ] Kobo sync is on, auto-convert targets KEPUB, ingest is additive
- [ ] A CWA service account for the broker exists (admin)
- [ ] SABnzbd has a `kobopush` category and an API key for the broker

## Design

No canvas board (no UI).

## Notes / decisions

Manual setup, no code. Steps: `deploy/truenas.md`. See [ADR 0003](../decisions/0003-cwa-as-library.md).
