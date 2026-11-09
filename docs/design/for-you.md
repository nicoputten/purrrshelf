# For you (Search tab)

Canvas boards (under "Recommendations: For you (v1)"):
10 · For you (Search tab, ready), 11 · Book page from For you (partner's
book), 12 · For you states. Reuses 2 · Book detail, 3 · Add sheet and
9 · Motion (PawLoader, Nap, EarsButton). Stories: BRK-11, APP-12, APP-13.
How the picks are made: [ADR 0035](../decisions/0035-recommendations-for-you.md).

## Search tab, ready (board 10)

- Under the search bar: paw icon + "For you, <name>" (Fredoka 24) and the
  sub line "Picked from what you finish. Looking is free; only Add uses a
  search." (13, secondary).
- Up to three horizontal rows, at most 10 cards each; a row with nothing in
  it is hidden. Row title (Fredoka 18) with a quiet sort hint on the right:
  - "Next in your series" · "Most recent first"
  - "More from authors you read" · "Newest first"; a "New" badge (accent) on
    books published this year or last year
  - "From <partner>'s shelf" · "Instant, no download"; an "Instant" badge
    (teal on dark green), partner's finished books first
- Card: cover 112×166 (radius 14), title (Fredoka 13), author (11,
  secondary), a "⋯" button (44 px hit area), and one reason line in ginger
  (11):
  - series: "<series> <n> · after book <m> you finished" / "· you're
    reading <m>"
  - author: "You finished <title>" (one book) or "You finished <n> books by
    this author"; without Kobo data "You own <n> by this author" (no
    pronouns: the broker doesn't know them)
  - partner: "<partner> finished it" or "On <partner>'s shelf"
  - a book already added shows its request status instead of nothing
- Tapping the card opens the existing book page. "⋯" opens a menu: Open
  book page / Not for me (rose) / Fewer by this author.
- Not for me: the card animates out; a snackbar "Hidden "<title>". You
  won't see it again." with Undo for 5 s.
- Never shown: an "available" or downloadable badge, ratings, prices, page
  counts, an "add all" button. Nothing downloads by itself.

Built (APP-12):

- For you shows whenever no search is going, in place of the old "looking
  costs nothing" hint; it comes back when the field is cleared.
- The "⋯" is a 36 px round button on the cover's top-right corner with an
  8 px hit slop (44+ target). The menu is a bottom sheet-style list; "Not
  for me" in rose.
- "New" uses an accent badge, "Instant" the teal success badge, both on the
  cover's bottom-left. A card never shows both: Instant wins.
- Fewer by this author also gets the snackbar with Undo ("You'll see fewer
  books by <author> for a while."); the rows are fetched again afterwards.
- The card animates out with a 200 ms fade (none with reduced motion); its
  row goes too when it was the last card.
- A card opens the book page with `from=for-you`, so the book page can show
  the reason banner (APP-13).
- "How to link it" on the Kobo hint expands in place: "Ask whoever runs your
  Purrshelf server to link your Kobo to the library."

## Book page from For you (board 11)

- A ginger banner at the top with the reason ("For you · From <partner>'s
  shelf, <partner> finished it").
- Partner's book: the action card says "Instant. <partner> already has the
  file." and "Uses no searches and no downloads", with "Also send to your
  Kobo" (on by default) and "Add to my library" (EarsButton).
- Any other book: the normal Add sheet and budget pill, unchanged.

## States (board 12)

- Loading (first open of the day, a few seconds): PawLoader + "Sniffing out
  picks for you…" + skeleton rows. Later opens show cached rows at once.
- Getting started (nothing finished, nothing new on the partner's shelf):
  the Nap cat, "Nothing to suggest yet", "Picks come from the books you
  finish on your Kobo. Finish one and this fills up.", "Search for a book".
- Kobo not linked (`readingData: false`): a hint card "Link your Kobo for
  better picks" / "We can't see what you finish yet, so these come from
  books you own." / "How to link it", above rows built from owned books.
- Sources down: the last rows with a small "Couldn't refresh" line
  (`stale: true`), else the translated `METADATA_UNAVAILABLE` with Try again.
- Already requested: the request status on the card.
