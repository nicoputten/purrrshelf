# BRK-15 Never get another book of the series

Status: done
Milestone: 11
Depends on: BRK-06

## Story

As a reader, I want the broker to grab the exact book of a series I added,
so that asking for book 1 never puts book 5 on my Kobo.

## Acceptance criteria

- [x] Adding a book stores its series name and position (from the metadata provider) with the request's search query
- [x] A release that names another volume of that series ("Series 05", "Series #5", "Series, Book 5", "Book Five") is rejected as `title_mismatch` ("another book"), however popular it is
- [x] A release that names a range ("Series 1-7") is rejected too: a bundle is not the book
- [x] The search judge rejects them as well, so a search that only finds other volumes moves on to the next query
- [x] A number in the book's own title, a year, or a release without a volume number never counts against it
- [x] Requests without a known series position behave as before
- [x] Tests first; the volume rules have 100% coverage

## Design

No screen change: the app already shows `title_mismatch` as "another book" in
Pick another.

## Notes / decisions

See [ADR 0045](../decisions/0045-series-volume-matching.md). Found when book 1
of a series whose first book carries the series name came out as book 5: all
seven volumes' release names held the whole title, and book 5 had the most
grabs.
