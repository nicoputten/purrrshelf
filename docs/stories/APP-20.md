# APP-20 See a book I add from the library on its page at once

Status: done
Milestone: 11
Depends on: APP-03, BRK-08

## Story

As a reader, I want a book's page to change as soon as I add a book the
library already has, so that I can see it worked and don't tap Add again.

## Acceptance criteria

- [x] After Add succeeds, the app reloads that book's page data and the library lists
- [x] A book the library already had (delivered at once, no search) shows its library and Kobo cards right away instead of the Add button
- [x] Tests first

## Design

No layout change: the book page already shows the library cards when the book
is in the library; it just never reloaded after Add.

## Notes / decisions

Found when a reader re-added a book that had been placed in the library by
hand: the broker delivered it at once, but the sheet closed and the page still
showed "Add to library", so it looked as if nothing happened and she tapped it
three more times.
