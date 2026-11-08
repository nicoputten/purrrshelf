# 0020. Covers are served by the broker, never hot-linked

Status: accepted
Date: 2026-11-08

## Context

Search hits and library books need real covers (BRK-07). Provider cover URLs
can carry keys, change, or disappear, and the app should only ever talk to the
broker.

## Decision

- The app loads every cover from `GET /api/v1/covers/:workId?size=s|m|l` with
  its bearer token. The reply is WebP, 2:3, at 120×180, 240×360 or 480×720,
  with an ETag (`304` on `If-None-Match`).
- Order: the Calibre cover for books in the library (through a
  `LibraryCovers` interface the library stream implements), then the first
  metadata cover that downloads (Hardcover, Open Library, Google Books).
- Remote covers are downloaded once and kept under `COVERS_PATH`
  (`/data/covers`) as the original plus the three sizes. A real cover is
  cached by the app for 30 days; when no cover exists the broker draws a
  placeholder card (title on a palette colour with cat ears), cached for an
  hour so a cover found later shows up. A work whose covers all failed is
  retried after an hour, not on every request.
- Cover downloads only go to public `https` hosts (no IP literals, no
  `localhost`, no redirects), so a provider reply can't make the broker probe
  the home network.
- On import without a Calibre cover, the importer gets the stored original
  from `CoverService.forImport` and hands it to CWA.

## Consequences

- `sharp` (libvips) is a broker dependency; its prebuilt binaries cover the
  Debian-based image.
- Covers are not in the JSON endpoint map; the contract exports `coverUrl()`.
