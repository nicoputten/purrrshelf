# 0018. Work ids and how metadata hits are merged

Status: accepted
Date: 2026-11-08

## Context

ADR 0007 picks three metadata providers and says hits are merged by ISBN,
then by normalised title + author. The app needs a stable id for a book it
found in search, before the book is in the library, and the details and
series endpoints need to know where a hit came from.

## Decision

- A **work id** is `<provider>:<provider id>` (`hardcover:123`,
  `openlibrary:OL27448W`, `googlebooks:zyTCAlFPjgYC`). A merged hit takes the
  id of its best source; every source is listed on the hit.
- The broker asks the three providers **in parallel** and merges in priority
  order (Hardcover, Open Library, Google Books). Two records are the same book
  when they share an ISBN-13 (ISBN-10s are converted), otherwise when their
  title (without subtitle, accents, punctuation or a leading article) and the
  first author's surname match. Each field comes from the best source that has
  it.
- One provider failing or not being configured does not fail the search; the
  reply says per provider `ok`, `failed` or `skipped`. Only when none answers
  does the broker reply `METADATA_UNAVAILABLE`.
- Normalised provider replies and merged hits are cached in SQLite
  (`metadata_cache`) for 7 days. Failures are never cached.
- Remote cover URLs stay inside the broker; the API only says `hasCover`, and
  the broker serves the image itself (BRK-07).
- Library state on a hit comes from a `LibraryLookup` interface; the library
  stream implements it once library items and ownership exist.

## Consequences

- A book found via Open Library keeps that id even if Hardcover later finds
  it; the library links works by ISBN and title + author, not by id alone.
- Hardcover's queries are checked against recorded replies only; a changed
  Hardcover schema shows up as `failed` for Hardcover while search keeps
  working on the other two.
