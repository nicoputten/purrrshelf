# 0034. Library filters are two rows: whose books, then one dropdown

Status: superseded by 0037 (row 2)
Date: 2026-11-09

## Context

The Library (APP-07, canvas board 6) showed its filters as two groups of
wrapping chips: Mine / Partner's / All, then Recently added / Unread / On my
Kobo / Series. On a phone the second group wrapped, so the filters took three
rows, both groups looked the same and it was not clear that only one view
applies at a time. The canvas draws a segmented control for whose books and a
"Recently added ▾" dropdown for the view.

## Decision

- Row 1 is a segmented control (`Segmented`): Mine · n / Partner's · n /
  All · n, one always selected.
- Row 2 is one dropdown pill (`Dropdown`) that shows the current view with ▾.
  Tapping it opens a small menu with Recently added, Unread, On my Kobo and
  Series; picking one closes the menu, tapping outside closes it unchanged.
- The view stays a single choice (as `LibraryView` already was), so the
  canvas' separate Unread / On my Kobo / Series chips move into the menu.

## Consequences

- The filters always take exactly two rows, whatever the screen width or
  language.
- Combining views (unread and on my Kobo at once) is not possible; it can be
  added later as checkable menu items without changing the layout.
