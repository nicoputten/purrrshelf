# Top 10s (Top 10 tab and Search teaser)

Canvas boards (design handover "Top 10s, new navigation"): 13 · Top 10 tab
(new tab bar + activity pill), 15 · Top 10 states + Search teaser. Reuses
2 · Book detail, 3 · Add sheet and 9 · Motion (PawLoader, Nap). Stories:
BRK-12 (charts), APP-15 (this screen). The tab bar and activity pill on
board 13 belong to APP-14 ([navigation](navigation.md)). Sources and refresh:
[ADR 0039](../decisions/0039-genre-top-10s.md).

## Top 10 tab (board 13)

- Header "Top 10" (Fredoka 28) with the budget pill on the right.
- Source switch (segmented, full width): Bestsellers (Apple Books) /
  Trending (Hardcover).
- Genre chips in one horizontally scrolling row: Thrillers & crime,
  Romance, Literary, Historical, Fantasy & sci-fi, Memoir, Non-fiction.
- Chart language line: "Chart: **English (US)**" with an outline "Switch to
  Dutch" pill on the right (and the other way round).
- Ranked list, one row per book: rank number (Fredoka, 40 px ginger for 1
  to 3, 30 px muted for 4 to 10, 44 px column), cover 52×78, title (Fredoka
  15), author (12, secondary), at most one chip, and "⋯" (36×44). Rows are
  separated by a 1 px surface line.
- Chips: "In your library" (teal), "Instant · on <partner>'s shelf" (rose),
  a request status such as "Downloading 64%" (ginger). A book nobody knows:
  dashed "?" cover and a ginger "Search for it".
- Footer (12, muted): "Charts from Apple Books · updated today 06:00" or
  "Trending on Hardcover · …".
- Never shown: availability badges, prices, ratings, "add all".

Built (APP-15):

- Thrillers & crime is the default genre; the `all` chart has no chip.
  "See all" on Search opens the tab on its genre (`/top10?genre=romance`).
- The chart language follows the reader: the broker lists the reader's own
  Apple chart first. The language line shows only on Bestsellers and only
  when the other region's chart is there.
- Bestsellers is the default for every reader. Trending is global and mostly
  English, so a Dutch reader only sees it after picking it. Without a
  Hardcover token on the server the source switch is hidden.
- The rank number is hidden from screen readers; the row reads "Rank N,
  title, author, chip". Tapping the row opens the book page; for a book
  nobody knows it runs the search instead ("<author> <title>" on the Search
  tab, free metadata search only). "Search for it" is part of the row,
  not a separate link.
- The chip order when more than one applies: in my library, then my open
  request, then a partner's copy (Instant). Settled requests (in library,
  pushed, cancelled) show no request chip. Request status words are the
  For you card's ("Added · waiting for a search"); download progress shows
  when the requests list is already loaded, otherwise just "Downloading".
- The "⋯" menu is the For you bottom-sheet style list: "Open book page",
  or "Search for it" for a book nobody knows.
- The "updated" time is the broker's `updatedAt` (the oldest chart in the
  answer), as day, month and time in the reader's language.

## States (board 15)

- Loading (the first look of the day takes a few seconds): PawLoader with
  "Fetching today's charts…" and four skeleton rank rows.
- Fewer than 10: the list as it is, then "That's all N for today. Lists
  fill up again tomorrow."
- None today: Nap cat, "Nothing in <genre> today", "This genre is empty on
  today's chart. Try Trending, or another genre." and a "Show Trending"
  button that switches the source. On Trending the button is left out and
  the hint only suggests another genre.
- Charts unavailable: the last list stays (slightly faded) under a banner
  "Couldn't refresh the charts. Showing the last list." with Retry; the
  footer says "last updated <time>" with the real time. The broker's
  `stale: true` shows the same banner. With nothing cached: the error
  message with Retry.

## Search teaser (board 15, last panel)

- Under For you: "Top 10 <genre> today" (Fredoka 18) with "See all" on the
  right, three covers 96×142 with a big ginger rank number (Fredoka 48)
  over each bottom-left corner, and "Charts from Apple Books" (12, muted).
- Built (APP-15): the teaser uses Bestsellers in the reader's language.
  Tapping a cover opens its book page (or searches for a book nobody
  knows). It shows nothing while loading or when the charts are down, so
  For you stays in charge of the screen.
- The board picks the reader's most-finished genre this month; the broker
  doesn't expose that yet, so the teaser shows Thrillers & crime for now
  and leaves out the board's "Your top genre this month" line.
