# 0040. Requests leave the tab bar for an activity pill

Status: accepted
Date: 2026-11-09

## Context

The tab bar was Search · Library · Requests · Settings. Top 10s (BRK-12,
APP-15) need a tab of their own. A Requests tab is empty most of the time,
and when something is on its way the reader wants to see it from wherever
they are, not on a separate tab. The design handover (canvas boards 13, 14,
9d) moves Requests out of the tab bar.

## Decision

- The tab bar is Search · Top 10 · Library · You. "You" is the settings
  screen (its route stays `/settings`).
- An **activity pill** floats just above the tab bar on every tab, but only
  while a request is on its way (searching, waiting for a search, downloading,
  importing) or needs the reader (not found, choose a release, download or
  import failed).
  - Active: a trotting cat, "Fetching <title>", the download percentage and
    bar, and "+N" when more requests are running. A download wins over other
    active requests.
  - Needs you: a pink pill "<title> needs you: <reason>". It wins over active
    requests and stays until the reader opens the sheet. Seen moments are kept
    for the app session; a new failure of the same request shows again.
- Tapping the pill, or a budget pill in a header, opens the **Requests
  sheet**: "Now" (needs-you first, with Try again or Pick another), "Earlier"
  (the last three finished books with "today" / "yesterday" / "n days ago")
  and "See all requests".
- The full list is a stack page, `/requests`, reached from the sheet and from
  a Requests button on the Library tab. It has a back button.
- **Swat** (board 9d replaces 9c): when a release is grabbed, the pill grows
  into a card that plays Swat and shrinks back. If the sheet is open, Swat
  plays in that request's row instead. With reduced motion, the pill only
  says "Got it!". Swat still plays once per grab: the pill, the sheet and the
  full list share one one-shot scope per request.
- After Fetch in the Add sheet, the reader stays where they are; the pill
  shows the new request. (Before, the app jumped to the Requests tab.)
- The pill and sheet follow requests over the existing server-sent events
  stream while the tabs are mounted.

## Consequences

- Progress is visible on every tab without a dedicated tab.
- Screens get 96 px of extra room at the bottom so the pill never hides the
  last item.
- Tests and docs that referred to a "Requests" or "Settings" tab now use the
  pill, `/requests` and "You".
