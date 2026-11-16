# 0049. A one-word title is searched with its subtitle

Status: accepted
Date: 2026-11-16

## Context

Since ADR 0046 a release of a one-word title must name the author or the
subtitle. The search still sent the bare word ("Atlas") as its title-only
query. That returned 100 unrelated books, and the right release, named
`Atlas .The.Story.of.Pa.Salt` without its authors, was not among them. A
search for "Atlas Pa Salt" found it at once.

## Decision

- The `title` query variant uses the telling words of the whole title
  (subtitle included, filler words like "the" and "of" left out) when the
  title before the subtitle has fewer than two telling words.
- Every other title keeps the short title, because release names often drop
  or reword the subtitle.
- `author_title` and `t=book` keep the short title.
- No query variant is added, so `MAX_SEARCHES_PER_INDEXER` stays 4 and the
  cost shown in the app doesn't change.

## Consequences

- One-word titles with a subtitle get a query that names the book.
- A release of such a book that leaves out both the author and the subtitle
  is no longer found by the title-only query; ADR 0046 would reject it anyway.
- Hit-rate stats for the `title` variant now mix both forms; they are only
  used to order variants.
