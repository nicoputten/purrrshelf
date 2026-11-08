# Book detail

Canvas board: 2 · Book detail. Stories: APP-04, APP-06, APP-08, APP-09.

- Top bar: back (44×44) and "More actions" (…).
- Cover 112×168 with cat ears; title (Fredoka 22), author, "Sherlock Holmes · 3
  of 4 · English · EPUB", ownership badges (Yours / Partner's).
- Reading progress: "You've read 42%" with a bar and a paw thumb.
- Device card: one row per Kobo with state ("On the device" in success, "Not
  on the device" muted) and an action: **Remove** (outlined) or **Send**
  (accent).
- Description (textBody).
- Series list: each entry shows "In library", "Add", "This book" or "Add next".
- "If you liked this one" with a cat icon and a row of four covers.

Built so far (APP-04, milestone 2):

- Back button; "More actions" waits until there are actions (remove, APP-06).
- Meta line reads "Lantern Keepers · 1/3 · English · EPUB"; EPUB only for books
  in the library. Owner badges: "Yours" first, then "Reader Two's".
- Kobo card shows only my Kobo's state for now; Send / Remove and the partner's
  Kobo come with APP-06. Reading progress comes with APP-08.
- Series rows: position, small cover, title and a label (This book, In library,
  Add next, Add). A row opens that book; Add becomes an action with APP-03.

Built in APP-09:

- "Similar books" is a horizontal row under the series list: cover, title and
  why it is suggested (Same series, Same author, Similar subject). A tap opens
  that book. The row is hidden when there is nothing similar.
- "Add next in series: <title>" is an outline button under the series list.
  Adding is always this explicit tap; it opens the Add sheet (APP-03).

Built in APP-06:

- The Kobo card has one row per reader's Kobo, mine first: "Your Kobo", then
  "Reader Two's Kobo". Each row shows its state under the name: "On the
  device" (success), "Waiting for next sync", "Leaves at next sync", "Not on
  the device" or "Not set up yet" (muted).
- Each row has one compact button (44 high): **Send** (accent) or **Remove**
  (outlined). Screen readers hear "Send to Reader Two's Kobo". A Kobo that is
  not set up has no button.
- A tap changes the row at once; if the broker refuses, the row goes back and
  the translated error shows under the card.

Built in APP-08:

- Under the hero, for a library book: "You've read 42%" (bold) above an
  8-high accent bar on `surfaceRaised` with a round paw thumb at the
  position. "You've finished this one" shows a full bar; "You're reading this
  one" (reading, no position yet) shows no bar. Nothing for an unread book or
  when my Kobo is not linked. Screen readers hear "Reading progress, 42%".

Motion (DES-02): **Send** is an ears-up button. When the broker confirms the
send, the Delivered scene plays once at the top of the Kobo card (cover drops
into an e-reader, paw-print confetti, success haptic) and then collapses.
Loading shows the paw-print loader.

My library (BRK-08, ADR 0009):

- For a library book I own, an outlined **Remove from my library** button sits
  under the reading progress. It takes the book off my library and my Kobo
  (the Kobo card's Remove only takes it off the device). Right after, the
  button becomes "Removed from your library and your Kobo." with a compact
  **Undo**; when nobody owns the book any more the text says it is deleted in
  7 days unless someone keeps it.
- For a library book I don't own (the partner's), an accent **Add to my
  library** button makes it mine at once: no search, no grab.
