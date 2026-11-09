# 0039. Genre top 10s from Apple Books charts and Hardcover trending

Status: accepted
Date: 2026-11-09

## Context

Readers want to browse what is popular right now, by genre, and add a book
from there. One reader reads Dutch, the other English. We looked at:

- **Hardcover**, already our first metadata provider: no genre lists. It
  has `books_trending` (the ids of the up to 100 books its readers finished
  most in a day, week or month), global and mostly English. Books carry
  reader-added genre tags. 60 calls a minute, backend only.
- **Apple Books charts** (`rss.marketingtools.apple.com`): public JSON, no
  key, per country. The NL chart is the Dutch ebook bestseller list, which
  suits a Kobo better than print lists. Every entry has Apple genre ids
  (stable across countries) but no ISBN. No per-genre feed: genres are cut
  from the top 100. The feeds are meant to promote Apple Books; for a
  private, self-hosted app that is low risk, but no licence spells it out.
- **NYT Books API**: free key, 500 calls a day, ISBNs, but only US print
  lists with few genres.
- **Bol.com** has the Dutch genre top 10s we'd want, and the **CPNB
  Bestseller 60** is the Dutch reference list, but neither has an API:
  scraping only.

## Decision

- `GET /charts` answers top 10s per genre from two sources: the Apple Books
  top paid ebook chart of the Netherlands and the US (the reader's own
  language first), and Hardcover trending of the last month (only when the
  server has a Hardcover token).
- The broker sorts books into a fixed set of genres the app translates:
  `all`, `thriller`, `romance`, `literary`, `historical`, `fantasy_scifi`,
  `biography`, `nonfiction`. Apple genre ids and Hardcover tags are mapped in
  `modules/charts/genres.ts`; a genre with no books is left out.
- Apple books are matched to a work with the same matcher as For you
  (title and first author, through the metadata providers), only for books
  that make a list, three at a time. A book no provider knows is still
  listed with its title and authors and `work: null`; the app then searches
  for it.
- Charts are fetched when a reader looks and the cached chart is older than
  24 hours; there is no timer. The last good chart is kept 30 days and
  served marked `stale` when a source is down. Library state and open
  requests are added per reader on every answer.
- The charts module only reads Apple and the metadata providers; a test
  proves it has no path to indexers, the budget, search or downloads.

## Consequences

- Looking at charts is free: no indexer search, no budget.
- The first look of the day can take several seconds (matching up to about
  60 Apple books); later looks are instant.
- Dutch chart titles often don't match Hardcover's English titles, so some
  Dutch books show without a cover until a provider (usually Google Books)
  knows the Dutch edition.
- Apple's genre ids were read from the live feeds; an id we haven't mapped
  only means that book shows in `all` and not in a genre list.
- Bol.com and CPNB lists stay out unless they get an API.
