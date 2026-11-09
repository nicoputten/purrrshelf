# 0035. For you: how recommendations are computed, filtered and refreshed

Status: accepted
Date: 2026-11-09

## Context

Readers want their next book without searching. The Search tab gets a
"For you" area with three rows (design: `docs/design/for-you.md`). The
indexer budget (ADR 0005, 0025) must stay untouched until a reader taps Add,
and there are only two readers, so there is no "people like you" data.

## Decision

- **Sources.** Only the library (Calibre `metadata.db`, CWA `app.db`, the
  broker's items and ownerships) and the three metadata providers through the
  discover module and its 7-day cache. The `recommend` module has no import
  path to indexers, the budget, search, releases or downloads; a test checks
  this, and another checks that only metadata hosts are called.
- **What counts.** With a linked Kobo, finished and in-progress books count
  (`book_read_link`, read in one query per reader). Without one, every owned
  book counts and the answer says `readingData: false`.
- **Languages.** A reader's languages are those of at least 20% of the
  books that count (Calibre's first language per book; finished books only
  with Kobo data). With none known, the app language. Suggestions in other
  languages are left out; books of unknown language pass.
- **Rows**, in this order, at most 10 books each, empty rows left out:
  1. **Next in your series**: per series, the reader's furthest book that
     counts; the next whole-numbered position in the provider's series
     (novellas like 2.5 are skipped). If the reader already owns that book,
     the series is skipped. Series by most recent activity; 15 series looked
     up per refresh. A seed book without a work id is matched first.
  2. **More from authors you read**: authors with at least one finished book
     (two owned books without Kobo data), most books first, 8 authors per
     refresh, at most 3 books each, never the middle of a series. Newest
     publication first.
  3. **From the partner's shelf**, one row per other reader: their books I
     don't own, with a work id (so the book page opens), in my languages;
     books they finished first (latest first), then newest owned. Built fresh
     on every request from library data; when the providers are down the
     library's own title, authors and series stand in.
- **Filtering at answer time** on every row: library state is matched again
  (owners, my Kobo), books I own and books I hid are left out, a book shows
  in one row only, and my open request (not `in_library`, `pushed` or
  `cancelled`) is attached so the card can show its status.
- **"New"**: published this year or last year. Providers only give the
  year, so this approximates "the last 12 months".
- **Dismissals** (`recommendation_dismissals`). _Not for me_ hides the book
  for good, matched by work id and by normalised title + first author.
  _Fewer by this author_ stores the first author's normalised name for 90
  days: the author row leaves them out and other rows move their books to
  the end. After 90 days the row stops counting and is pruned on the next
  dismissal. Undo deletes every dismissal made from that book.
- **Refresh.** The series and author rows are cached per reader
  (`recommendation_cache`) with a fingerprint of the books that count, their
  status and the reader's languages. They are rebuilt when the fingerprint
  changes (a book finished or started, a language change) or after 24 hours,
  only when the reader opens For you. No timer or job.
- **Providers down.** When every metadata lookup in a refresh fails, the last
  cached rows are served with `stale: true` ("Couldn't refresh"). With nothing
  cached and no partner books to show, the answer is `METADATA_UNAVAILABLE`.

## Consequences

- Looking at For you never spends a search or a grab; a refresh makes at
  most about 40 provider lookups, most of them answered from the cache.
- Imported books that were never matched to a work cannot seed a series
  without a provider match and never appear in the partner row.
- The 20% language rule and the 90-day decay are guesses to revisit once
  both readers have used it for a while.
- Tags are now read from Calibre but not used yet; a genre row (version 2)
  can build on them.
