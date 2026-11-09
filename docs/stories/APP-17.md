# APP-17 See my top genre's Top 10 on Search

Status: done
Milestone: 11
Depends on: APP-15, BRK-14

## Story

As a reader, I want the Top 10 teaser on Search to show my favourite genre
of the month, so that the charts I see first are ones I'd read.

## Acceptance criteria

- [x] The teaser shows the list for `topGenre` with "Your top genre this month" under the title, and "See all" opens the Top 10 tab on that genre
- [x] Without a top genre, or when today's chart has no list for it, the teaser shows thrillers without that line
- [x] New strings in `en` and `nl`

## Design

Canvas board: 15 · Top 10 states + Search teaser — docs/design/top-10s.md

## Notes / decisions

See [ADR 0044](../decisions/0044-reader-top-genre.md).
