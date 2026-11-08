# BRK-07 Serve and cache book covers

Status: done
Milestone: 4
Depends on: BRK-02

## Story

As a reader, I want every book to show its real cover,
so that the app looks like a bookshelf, not a list of file names.

## Acceptance criteria

- [x] `GET /covers/:workId?size=s|m|l` returns resized WebP with long cache headers and an ETag
- [x] Library books use the Calibre cover; search hits fall back Hardcover → Open Library → Google Books
- [x] Remote covers are downloaded once and stored on `/data` in three sizes
- [x] No cover anywhere → generated placeholder card
- [x] On import without a Calibre cover, the best metadata cover is handed to CWA

## Design

No canvas board (no UI).

## Notes / decisions

Built in milestone 2 because the search screen (APP-02) needs covers. See
[ADR 0020](../decisions/0020-covers-served-by-the-broker.md).

- Library covers come through `LibraryCovers`, which the library stream
  implements on the `LibraryAdapter`; until then every book uses metadata
  covers.
- The import hand-off is `CoverService.forImport(workId)`; BRK-06 calls it.
