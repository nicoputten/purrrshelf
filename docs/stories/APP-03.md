# APP-03 Add a book to my library

Status: done
Milestone: 4
Depends on: BRK-05, BRK-06

## Story

As a reader, I want to add a book from search with one tap,
so that it gets downloaded and lands on my Kobo without managing anything.

## Acceptance criteria

- [x] Add sheet shows language, Kobo targets and the search cost
- [x] Book already in the library: no indexer search, ownership added
- [x] Progress is visible live until "On your Kobo"

## Design

Canvas board: 3 · Add to library — `docs/design/add-sheet.md`

## Notes / decisions

- `POST /requests` answers right away with status `searching`; the search (or
  the library check) runs after the answer, so the app can follow it. Adding a
  book that still has an open request answers that request and spends nothing.
- Once the book is in the library the asker owns it (library items from the
  library stream) and it goes on the Kobo shelf of every chosen reader; the
  request is then `pushed` ("On your Kobo after its next sync"). A Kobo that
  can't be reached leaves the request `in_library` with the reason.
- Kobo targets come from `GET /readers`: readers linked to a CWA account.
- The Requests tab polls every 3 s while a request is on its way; APP-05
  replaces this with SSE and adds the step list and "Pick another".
