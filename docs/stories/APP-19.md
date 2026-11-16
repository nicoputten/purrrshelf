# APP-19 Tell Purrshelf it fetched the wrong book

Status: done
Milestone: 12
Depends on: BRK-19, APP-18

## Story

As a reader, I want a "Wrong book?" action on a book Purrshelf fetched, so
that I can get rid of it and look again in one go.

## Acceptance criteria

- [x] "Wrong book?" is on the book page (under Remove from my library; there is no ⋯ menu yet) for a library book that came from my request, and on finished rows in the Requests sheet for 7 days
- [x] The sheet names what I asked for and what was fetched, says what will happen (off both Kobos, deleted from the library, never picked again) and offers Search it myself (default), Let Purrshelf look again and Just remove it
- [x] **Remove and search** does it and then opens Search it yourself, Requests, or goes back, as chosen; Keep it closes the sheet
- [x] Every new string has `en` and `nl`

## Design

Canvas boards: 16c, 16d — [book-detail.md](../design/book-detail.md),
[navigation.md](../design/navigation.md)

## Notes / decisions

[ADR 0048](../decisions/0048-search-it-yourself-and-wrong-book.md).
