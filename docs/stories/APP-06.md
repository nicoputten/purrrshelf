# APP-06 Send a book to my or my partner's Kobo

Status: done
Milestone: 5
Depends on: BRK-03

## Story

As a reader, I want to send a book to my Kobo, my partner's or both,
so that either of us can put a book on either device.

## Acceptance criteria

- [x] Send / Remove per Kobo on the book page
- [x] State shows "waiting for next sync" until the device has it
- [x] Optimistic update with rollback on error

## Design

Canvas board: 2 · Book detail — `docs/design/book-detail.md`

## Notes / decisions

- One row per reader's Kobo, mine first. Either reader may send a book to
  either Kobo; sending makes that reader an owner (ADR 0009). Removing from a
  Kobo keeps the book and its owners.
- States: on the device, waiting for next sync (shelf changed, Kobo not synced
  yet), leaves at next sync, not on the device, not set up yet (reader not
  linked to CWA, or no Kobo shelf). A Kobo that is not set up has no button.
- A reader's Kobo is linked with `purrshelf user link-cwa <username>
--cwa-user <CWA user>`; `/me` reports `kobo.configured` once linked.
- API: `GET /library/items/:itemId/kobos`, `PUT` / `DELETE
/library/items/:itemId/kobos/:userId`; new error `KOBO_NOT_LINKED`.
- Discover's "in library" state now comes from `library_items` and Calibre
  ISBNs, so search hits and the book page know the library item.
