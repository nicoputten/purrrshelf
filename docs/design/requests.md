# Requests & progress

Canvas board: 4 · Requests & progress. Stories: APP-05.

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

Built so far (APP-03):

- Title "Requests" with the budget pill; one card per request (cover, title,
  author · language) with a one-line status and a progress bar while
  downloading. "On your Kobo after its next sync" in success; failures in
  danger. Empty state: "Nothing on its way" with "Find a book".
- The list refreshes every 3 s while a request is on its way. The step list,
  Pick another, Try again and live SSE updates come with APP-05.
