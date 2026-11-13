# 0046. Resend books the Kobo never received: off the shelf and back on

Status: accepted
Date: 2026-11-13

## Context

During the first syncs through the away-from-home proxy (ADR 0043) the proxy
cut off CWA's sync reply. CWA v4.0.8 had already written the books in that
reply to `kobo_synced_books` while it built the reply, so it treated them as
delivered and never sent them again. The app showed them as "on my Kobo".

How CWA v4.0.8 decides what to send (selected-shelves sync, `cps/kobo.py`):

- A book goes out when it is on a Kobo-synced shelf, is **not** in
  `kobo_synced_books` for that user, and its shelf link (`date_added`) or the
  book itself changed after the Kobo's sync token.
- A book that left the shelf loses its row in `kobo_synced_books` at the next
  sync (and the Kobo is told to drop it).
- With no rows at all for a user, CWA ignores the sync token and sends the
  whole shelf again ("Force full sync", admin-only for other users).
- When the Kobo fetches a book file (`/kobo/<token>/download/...`), CWA adds a
  row to `downloads` for that user. When the Kobo asks for a book's reading
  state, CWA creates a `kobo_reading_state` row.

So deleting a book's row in `kobo_synced_books` is not enough to resend an old
book: its shelf link must also be newer than the Kobo's sync token.

## Decision

- **Detect** read-only (ADR 0022): a book on a reader's Kobo shelf that CWA
  marked synced, with no `downloads` row and no `kobo_reading_state` row for
  that reader, has not reached their Kobo. The app shows such a book as
  "sending", not "on my Kobo".
- **Resend** through the Kobo shelf API the broker already uses (ADR 0021), in
  a job that runs every 10 minutes:
  1. After a 30-minute grace period, take the book off the reader's Kobo shelf.
  2. Wait until a Kobo sync has cleared CWA's mark.
  3. Put it back on the shelf. That gives it a fresh `date_added`, so the next
     sync sends it as a new book.
  4. Delivered (downloaded or reported on) → done. Still missing after 3
     resends → stop and leave it for a person (`purrshelf kobo status`).
- The broker's progress lives in its own `kobo_resends` table. A reader taking
  the book off their Kobo in the app cancels the resend.
- This never touches an indexer and needs no new CWA rights.

Alternatives Nico weighed and turned down (2026-11-13):

- Write to CWA's `app.db` (delete the row and refresh the shelf link): one
  sync instead of two, but it needs a read-write mount and supersedes ADR 0022.
- Make the service account an admin and call CWA's "Force full sync" for the
  reader: one sync, but it resends the whole shelf and widens the service
  account's rights (ADR 0021).

## Consequences

- A lost book reaches the Kobo after two more syncs instead of never. Between
  them the Kobo may get a "remove" for a book it never had, which is harmless.
- "On my Kobo" now means the Kobo fetched the book, not only that CWA meant
  to send it. A book downloaded through the CWA web UI by the same user also
  counts as delivered; that is rare and only means no resend.
- If CWA ever forgets downloads (it wipes `downloads` when the Calibre
  library is switched), books the Kobo already has would look lost. The grace
  period, the 3-attempt cap and `purrshelf kobo status` keep that visible;
  a resend of a book the Kobo has is a remove and re-download, and its reading
  position comes back from CWA.
- The contract tests check against the pinned CWA image that a Kobo download
  marks the book delivered, so a CWA upgrade that changes this fails CI.
