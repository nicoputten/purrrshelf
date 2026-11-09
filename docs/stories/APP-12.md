# APP-12 See books picked for me on the Search tab

Status: todo
Milestone: 10
Depends on: BRK-11

## Story

As a reader, I want a "For you" area under the search bar,
so that my next book is one tap away.

## Acceptance criteria

- [ ] "For you, <name>" with "Picked from what you finish. Looking is free; only Add uses a search." under the search bar
- [ ] Up to three horizontal rows of at most 10 cards (next in your series, more from authors you read, from <partner>'s shelf); empty rows hidden
- [ ] Card: cover 112×166, title, author, a one-line reason in ginger, "New" (author row) or "Instant" (partner row) badge, the request status when already added, and a "⋯" button (44 px hit area): Open book page / Not for me / Fewer by this author
- [ ] Tapping a card opens the existing book page
- [ ] Not for me: the card animates out and a snackbar "Hidden "<title>". You won't see it again." offers Undo for 5 s
- [ ] States: loading (PawLoader, "Sniffing out picks for you…", skeleton rows; cached rows instantly afterwards), getting started (Nap cat, "Nothing to suggest yet", Search for a book), Kobo not linked hint, "Couldn't refresh" over stale rows, retry on METADATA_UNAVAILABLE
- [ ] Never an "available" badge, ratings, prices, page counts, "add all" or auto-download
- [ ] Every new string in English and Dutch; the partner's name comes from the broker

## Design

Canvas boards: 10 · For you (Search tab, ready), 12 · For you states —
[`docs/design/for-you.md`](../design/for-you.md)

## Notes / decisions

See [ADR 0035](../decisions/0035-recommendations-for-you.md).
