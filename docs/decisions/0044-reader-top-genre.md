# 0044. The reader's top genre for the Search teaser

Status: accepted
Date: 2026-11-09

## Context

The Top 10 teaser on Search (APP-15, board 15) should lead with "your top
genre this month". The broker already reads each reader's books with
Calibre tags and their Kobo reading state from CWA, for For you (BRK-11).
The charts already sort books into a fixed set of genres (ADR 0039).

## Decision

- `GET /charts` gets `topGenre`: the chart genre of most books the reader
  finished in the last 30 days, judged by CWA's last reading update for the
  book. A tie goes to the genre finished most recently.
- A book's genres come from its Calibre tags, matched against the same tag
  list as Hardcover's (now with common Dutch tags such as "Spanning" and
  "Non-fictie"). Compound tags like "Fiction / Thrillers" count by part.
- `topGenre` is null when the reader's Kobo isn't linked, nothing with a
  known genre was finished this month, or the library can't be read. A
  library failure never fails the charts.
- The app shows the top genre's list with "Your top genre this month" when
  today's chart has that list, and otherwise falls back to thrillers
  without the line.
- It is computed on each request, from the same bulk reads For you uses.
  Nothing here reaches an indexer.

## Consequences

- The teaser is only as good as the library's tags; untagged books don't
  count.
- "Finished this month" uses CWA's last update time, so finishing an old
  book again or changing its state moves it into this month.
