# BRK-07 Serve and cache book covers

Status: todo
Milestone: 4
Depends on: BRK-02

## Story

As a reader, I want every book to show its real cover,
so that the app looks like a bookshelf, not a list of file names.

## Acceptance criteria

- [ ] `GET /covers/:workId?size=s|m|l` returns resized WebP with long cache headers and an ETag
- [ ] Library books use the Calibre cover; search hits fall back Hardcover → Open Library → Google Books
- [ ] Remote covers are downloaded once and stored on `/data` in three sizes
- [ ] No cover anywhere → generated placeholder card
- [ ] On import without a Calibre cover, the best metadata cover is handed to CWA

## Design

No canvas board (no UI).

## Notes / decisions
