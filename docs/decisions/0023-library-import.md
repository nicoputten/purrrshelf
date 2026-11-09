# 0023. Importing the existing Calibre library

Status: superseded by [0034](0034-remove-library-import.md)
Date: 2026-11-08

## Context

The household already has a Calibre library in CWA. BRK-09 brings it into
Purrshelf: every book gets a library item (ADR 0009), books are matched to a
work so the book page and search can show them, and each reader says which
books are theirs. A library can hold hundreds of books, and matching asks the
metadata providers once per book, which takes minutes.

## Decision

- **Scan, then match in the background.** `POST /admin/import` reads
  `metadata.db` page by page (by book id) and gives every Calibre book an item
  straight away, so the request returns in seconds. Books without a work are
  then matched one at a time, inside the broker process. `GET /admin/import`
  reports progress. Matching is metadata search only (ADR 0005): a search hit
  sharing one of the book's ISBNs, or else one with the same title and first
  author. When neither is found the book stays without a work.
- **Re-running is safe.** Items are found by Calibre id, matched works are
  kept and only books still without a work are searched again. One run at a
  time; a second `POST` while one is busy just reports on it.
- **Not a persisted job.** A broker restart stops matching after the current
  book; the next run picks up the rest. This keeps the import out of the job
  runner, which is about timed work (ADR 0004); the import keeps no time.
- **Any signed-in reader may run it.** The household has no admin role; the
  paths sit under `/admin` so one can be added later.
- **The review sets owners.** `PUT /admin/import/owners` takes a list of items
  and the readers who own them, and replaces their owners. The app uses it for
  one book or for every book shown. It does not touch Kobo shelves: the
  import is about who owns what, and a book already on a Kobo stays there.

## Consequences

- An imported book nobody has claimed has no owners and no `delete_after`, so
  it is never deleted (ADR 0009) until someone owns it and later removes it.
- A book without a work shows in the Library tab but has no book page until a
  later run, or a search hit with its ISBN, gives it one.
