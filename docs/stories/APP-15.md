# APP-15 Browse genre top 10s in their own tab

Status: done
Milestone: 11
Depends on: BRK-12, APP-14

## Story

As a reader, I want a Top 10 tab with today's bestsellers and trending books
per genre, in my own language,
so that I can find my next book without knowing what to search for.

## Acceptance criteria

- [x] A Top 10 tab: header "Top 10" with the budget pill, a Bestsellers (Apple Books) / Trending (Hardcover) switch, and scrollable genre chips (Thrillers & crime, Romance, Literary, Historical, Fantasy & sci-fi, Memoir, Non-fiction; no chip for the whole chart), Thrillers & crime first
- [x] The chart follows the reader's language (the broker's first Apple chart), with "Chart: English (US)" / "Dutch" and "Switch to Dutch/English"; Bestsellers is the default for everyone, Trending only when picked
- [x] A ranked list: big rank number (40 px ginger for 1 to 3, 30 px muted for 4 to 10, hidden from screen readers; the row reads "Rank N"), cover 52×78, title, author, at most one chip and a ⋯ button with a 44 px target
- [x] Chips: none, "In your library", "Instant · on <partner>'s shelf", or my request status ("Downloading 64%" when the requests list is loaded)
- [x] Tapping a row opens the book page; a book no provider knows gets a dashed "?" cover and "Search for it", which runs a free metadata search for "<author> <title>" on the Search tab; the ⋯ menu offers Open book page or Search for it
- [x] Footer: "Charts from Apple Books" or "Trending on Hardcover" · "updated <date time>"
- [x] States: loading (PawLoader, "Fetching today's charts…", skeleton ranks), fewer than 10 ("That's all N for today"), none today (Nap cat, "Show Trending" on Bestsellers), charts unavailable (last list kept with "Couldn't refresh" and Retry and "last updated <time>"; the error with Retry when nothing is cached; `stale` from the broker shows the same banner)
- [x] Search tab teaser under For you: "Top 10 <genre> today" with the first three covers and ranks and "See all", which opens the Top 10 tab on that genre (`/top10?genre=…`)
- [x] Looking is free: no availability badges, prices, ratings or "add all"; every new string in English and Dutch

## Design

Canvas boards: 13 · Top 10 tab (new tab bar + activity pill), 15 · Top 10
states + Search teaser — [`docs/design/top-10s.md`](../design/top-10s.md)

## Notes / decisions

See [ADR 0039](../decisions/0039-genre-top-10s.md) for the chart sources.

- Data: `useCharts()` (`['charts']`, one hour stale time); everything else
  is picked from that one answer in the app (source, region, genre).
- The teaser should show the reader's most-finished genre this month. The
  broker doesn't expose that yet, so it always shows Thrillers & crime
  (TODO in `features/top10/Top10Teaser.tsx`). It needs a broker field, e.g.
  `topGenre` on `/charts`.
- The request chip reads progress from the requests list already loaded by
  the activity pill or Requests; it never fetches it. Without it the chip
  says "Downloading".
- The Search tab takes a `q` route param (`/?q=…`) for "Search for it".
- The budget pill still opens Requests; APP-14 points it at the Requests
  sheet.
