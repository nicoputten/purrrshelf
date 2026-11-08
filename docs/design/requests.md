# Requests & progress

Canvas boards: 4 · Requests & progress, 9c · Swat in the Requests screen.
Stories: APP-05, DES-02.

- Title "Requests" and the budget pill.
- Active request card: small cover, title, "For your Kobo · English", then a
  step list:
  1. Sniffed it out — "Found on the first try · 1 search" (done)
  2. Picked the best match — "EPUB · 1.4 MB · English" + **Pick another** pill
  3. Downloading — percentage and progress bar with a walking cat (current)
  4. Adding to the library, making it Kobo-friendly (pending)
  5. On your Kobo after its next sync (pending)
- Not found card: sleeping cat, "Couldn't sniff this one out · 4 searches on
  <indexer>", **Try again · up to 4** and Dismiss.
- Finished card: small cover, title, "On your Kobo" with a happy cat.

Built (APP-03, APP-05):

- Title "Requests" with the budget pill. Cards are live over server-sent
  events; while the stream is down the list refreshes every 3 s.
- A request on its way shows the five steps with a dot each (done, now, still
  to come, failed). The pick step shows "EPUB · 1.4 MB · English" and a
  **Pick another** pill while picking still makes sense (choosing,
  downloading, download or import failed). Downloading shows the percentage
  and a bar.
- Meta line: "For your Kobo · English", "For another Kobo" or "For the
  library".
- Not found: "Couldn't sniff this one out", "4 searches on Primary",
  **Try again · up to 4** (4 per indexer with a budget) and Dismiss. Failed
  downloads and imports get the same two buttons.
- Finished: "On your Kobo" in success, no steps. Dismissed requests leave the
  list.

Motion (DES-02, board 9c; see design-choices.md, Motion):

- **Swat** plays once inside the card, between the title row and the step
  list, the moment a release is grabbed (the request turns to downloading, or
  Pick another grabs a new release). The scene is 318 × 166 on a 390 wide
  phone (the 576 × 300 board scene scaled to the card width) on its own dark
  stage with rounded corners. After about 1.6 s it collapses and the step
  list, already under it, moves up. A download that was already running when
  the screen opened doesn't swat.
- **Trot** replaces the plain bar on the Downloading step: the cat runs at the
  real percentage from the live events and bobs while it downloads.
- **Delivered** plays once in the finished card when the request reaches "On
  your Kobo", then collapses to the finished card.
- **Nap** sits under the title in the not-found card and while a request is
  waiting for a free search.
- Loading the list shows the paw-print loader; Try again shows it inside the
  button.
