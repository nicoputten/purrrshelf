# BRK-16 Never take a book that only shares one title word

Status: done
Milestone: 11
Depends on: BRK-06, BRK-15

## Story

As a reader, I want the broker to grab the book I added and not another book
that happens to share its one-word title, so that adding "Atlas" by one
author never puts "Atlas of Hell" by someone else on my Kobo.

## Acceptance criteria

- [x] A release whose name holds the title's words but none of the authors' surnames is rejected as `title_mismatch` ("another book") when the title has only one telling word (filler words like "the", "of", "de" don't count)
- [x] Such a release still counts when it also names the subtitle and that makes two or more telling words ("Atlas - The Story of …")
- [x] Titles of two or more telling words keep today's rule: a missing author costs points but is not rejected
- [x] A work without authors keeps today's rule
- [x] The search judge applies the same rule, so a search that only finds other "Atlas" books moves on to the next query
- [x] Tests first; the matching rules have 100% coverage

## Design

No screen change: the app already shows `title_mismatch` as "another book" in
Pick another, and a request with no acceptable release already stops at
"choose a release".

## Notes / decisions

See [ADR 0046](../decisions/0046-one-word-titles-need-the-author.md). Found when
"Atlas: The Story of Pa Salt" (book 8 of a series) came out as another book
called "Atlas …": the subtitle is dropped before matching, so "Atlas" was the
only word checked, and the author only cost 10 points.
