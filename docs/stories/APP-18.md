# APP-18 Search it myself when a book is hard to find

Status: done
Milestone: 12
Depends on: BRK-18, APP-05, APP-16

## Story

As a reader, I want to type my own search words and pick the release myself
when Purrshelf couldn't find a book, so that a book with an odd release name
still reaches my Kobo.

## Acceptance criteria

- [x] "Search it myself" shows next to Try again on a not-found request (Requests sheet and full list), at the bottom of Pick a release, and on the Add sheet only when a low-odds warning shows
- [x] The Search it yourself screen shows what was tried, the words (prefilled, with suggestions from the title, subtitle, author and series), one indexer to look on with its searches left today, and the cost before the tap
- [x] "Sniff with these words" shows the paw-print loader, then opens Pick the right one with the results; no results shows the napping cat and keeps the words
- [x] Pick the right one uses the release picker with the "Your words, your pick" banner; "Another book?" releases show a warning label and **Fetch anyway**
- [x] With no searches left on the chosen indexer the button is off and says until when
- [x] Every new string has `en` and `nl`

## Design

Canvas boards: 16, 16b, 16d — [release-picker.md](../design/release-picker.md),
[requests.md](../design/requests.md), [add-sheet.md](../design/add-sheet.md)

## Notes / decisions

[ADR 0048](../decisions/0048-search-it-yourself-and-wrong-book.md).
