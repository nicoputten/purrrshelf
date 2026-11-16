# BRK-20 Find a one-word title by its subtitle too

Status: done
Milestone: 12
Depends on: BRK-07, BRK-16

## Story

As a reader, I want the broker to search a one-word title together with its
subtitle, so that a book like "Atlas: The Story of Pa Salt" is found even when
its release name leaves out the author.

## Acceptance criteria

- [x] When the title before the subtitle has fewer than two telling words, the title-only query searches the telling words of the whole title ("Atlas Story Pa Salt")
- [x] Titles that tell the book apart on their own, and titles without a subtitle, are searched as before
- [x] The author + title and `t=book` queries keep the short title
- [x] No new query: a search still costs at most four calls per indexer
- [x] Tests first; the search module stays at 100% coverage

## Design

No screen change.

## Notes / decisions

See [ADR 0049](../decisions/0049-one-word-title-searches-subtitle.md). The real
release was named `Atlas .The.Story.of.Pa.Salt`: "Lucinda Riley Atlas" found
nothing on either indexer, and "Atlas" alone returned 100 other books.
