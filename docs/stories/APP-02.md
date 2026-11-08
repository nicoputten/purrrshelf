# APP-02 Search for a book by title and see covers and badges

Status: done
Milestone: 2
Depends on: BRK-02, BRK-07

## Story

As a reader, I want one search field with results that show real covers and "in library" / owner badges,
so that I can tell at a glance whether we already have a book.

## Acceptance criteria

- [x] Search home with one field, language chips (any / English / Nederlands)
- [x] Each hit shows cover, title, author, series and badges (On your Kobo, Partner has it)
- [x] Copy makes clear that looking is free and only Add spends a search
- [x] Indexer budget pill shows searches left today
- [x] Empty, loading and error states are translated

## Design

Canvas board: 1 · Search (home) — `docs/design/search.md`

## Notes / decisions

- Search runs 450 ms after the last keystroke (two letters minimum), or at
  once on the keyboard's search key. It is metadata search only (BRK-02).
- Covers come from the broker (BRK-07) with the access token; the placeholder
  card shows while loading and when a cover fails.
- The budget pill reads `GET /budget` (BRK-04) and hides while the server has
  no indexers.
- The **Add** button and sheet arrive with APP-03; until then a card opens
  Book detail (APP-04).
