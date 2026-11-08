# APP-09 See similar books on a book's page

Status: done
Milestone: 7
Depends on: BRK-02

## Story

As a reader, I want to see similar books on a book's page,
so that I find my next read without searching.

## Acceptance criteria

- [x] Similar books only on the detail screen
- [x] Built from same series, same author, then subject/genre
- [x] "Add next in series" is an explicit action (it opens the Add sheet, APP-03)

## Design

Canvas board: 2 · Book detail — `docs/design/book-detail.md`

## Notes / decisions

- `GET /works/:id/similar` (broker, discover module) answers at most 12 books,
  each with a reason: `series` (up to 4, the books after this one first), then
  `author` (up to 4, the first author), then `subject` (the first two
  subjects). Duplicates and the book itself are left out by title + author.
- When the book's language is known, suggestions in other languages are left
  out, so a Dutch book suggests Dutch books.
- Metadata only: the same three providers and 7-day cache as search, so it
  never spends an indexer search (ADR 0005). The discover zero-indexer test
  covers the new endpoint.
- Suggestions are remembered like search hits, so tapping one opens its page.
- The route passes the Add sheet (APP-03) as the handler, so "Add next in
  series" opens it for the next missing book.
