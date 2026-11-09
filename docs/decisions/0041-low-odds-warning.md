# 0041. Warn before Add when a book will be hard to find

Status: accepted
Date: 2026-11-09

## Context

Searches are scarce (ADR 0025): one Add can cost up to 4 per indexer. Some
books are very unlikely to be found: Dutch ebooks are rarely shared, brand-new
books take weeks to turn up, and a book that was "not found" last week will
usually still be missing. Readers found out only after spending the searches.
Design boards 3b and 3c add a warning to the Add sheet.

## Decision

- The broker works out the warning; the app owns the words. New endpoint
  `GET /requests/preview?workId=&language=` answers `lowOdds: null` or the
  single strongest reason as a code.
- Reasons, strongest first. Only the first that applies is sent:
  1. `LOW_ODDS_NOT_FOUND`: any reader's request for this work ended
     `not_found` in the last **30 days** (with the date of the latest).
  2. `LOW_ODDS_NO_MATCH`: the merged metadata has no ISBN, so the search has
     only a title and author to go on.
  3. `LOW_ODDS_NEW`: published **14 days** ago or less, or not out yet. Uses
     the full release date when a provider has one; with only a year, a year
     after the current one counts as not out yet.
  4. `LOW_ODDS_LANGUAGE`: the chosen language is not English. When the work
     has an English edition the reply names it (`englishEditionWorkId`, today
     always this same work), so the app can offer "Try the English edition".
  5. `LOW_ODDS_RARE`: Hardcover knows the book and fewer than **10** of its
     readers have it (`users_count`). Ten is low enough that only niche books
     trip it: a book a few hundred people read is usually shared somewhere,
     while one with a handful of readers often is not. Books Hardcover doesn't
     know get no rarity warning (reason 2 covers them when there is no ISBN).
- A book already in the library gets no warning (Add only records ownership).
- Computing it uses metadata (cached) and the requests table only. The new
  `odds` module may not import indexers, budget, search or downloads; the
  zero-indexer test checks this as it does for discover and For you.
- The warning never blocks: the button reads "Fetch it anyway".
- "Remind me in 2 weeks" (board 3c) is left out for now; it would need a
  "Later" row on the Search tab. If it comes, it must never search on its own.

## Consequences

- Hardcover's book query asks for two more fields (`release_date`,
  `users_count`); the internal metadata record gains `releaseDate`,
  `languages` and `readers`. Nothing else in the API changes.
- Thresholds live in the contract (`LOW_ODDS_*`) so app and broker agree.
- A failed preview hides the warning; Add works as before.
