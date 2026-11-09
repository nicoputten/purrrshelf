# 0037. Library: a filter and a sort dropdown, and titles under covers

Status: accepted
Date: 2026-11-09
Supersedes: 0034 (row 2 only)

## Context

ADR 0034 put one dropdown in the Library's second row that mixed sorting
(Recently added, Series) with filtering (Unread, On my Kobo). There was no way
to sort by title or author, or to filter and sort at once. The grid showed a
cover and a status line ("Unread") but no title, so books with a real cover
image were hard to tell apart.

## Decision

- Row 1 stays the segmented Mine / Partner's / All.
- Row 2 holds two dropdown pills side by side:
  - **Show**: All books, Unread, Reading, Finished, On my Kobo. A book without
    progress counts as unread.
  - **Sort by**: Recently added, Title (ignoring a leading The / A / An / De /
    Het / Een), Author (by last name of the first author, then title), Series
    (series books by series name and position, then the rest by title).
- Each cover has the title under it (up to two lines). The status line only
  shows when it says something ("42% read", "Reading", "Finished"); "Unread"
  is the default and is left off. Screen readers still hear the status.

## Consequences

- Filter and sort combine, and the filters are still two rows.
- Sorting by series no longer hides books that are not in a series.
