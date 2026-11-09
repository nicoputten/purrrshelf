# BRK-14 Know my top genre this month

Status: done
Milestone: 11
Depends on: BRK-12, BRK-11

## Story

As a reader, I want the broker to know which genre I finished most this
month, so that the app can open the Top 10s on what I actually read.

## Acceptance criteria

- [x] `GET /charts` has `topGenre`: the chart genre of most books I finished on my Kobo in the last 30 days (by Calibre tags), a tie going to the genre finished most recently
- [x] Calibre tags count whole or by part ("Fiction / Thrillers"), with common Dutch tags ("Spanning", "Historische roman", "Non-fictie")
- [x] `topGenre` is null without Kobo reading data or a finished book with a known genre; a library error logs a warning and leaves the charts working
- [x] Still no indexer calls from the charts module

## Design

Canvas board: 15 · Top 10 states + Search teaser — docs/design/top-10s.md

## Notes / decisions

See [ADR 0044](../decisions/0044-reader-top-genre.md). Uses the same
`ReaderShelf` bulk reads as For you.
