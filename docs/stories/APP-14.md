# APP-14 Follow my requests from any tab

Status: in review
Milestone: 11
Depends on: APP-03, APP-05, DES-02

## Story

As a reader, I want to see what's being fetched from wherever I am in the
app, and to get to a request that needs me in one tap, so that I don't have
to keep a Requests tab open, and there's room in the tab bar for Top 10s.

## Acceptance criteria

- [x] The tab bar is Search · Top 10 · Library · You (settings); Requests is not a tab; the Top 10 tab holds a placeholder until APP-15
- [x] An activity pill floats above the tab bar on every tab while a request is active ("Fetching <title>", progress bar, "+N") or needs me (pink, "<title> needs you: <reason>", until I open the sheet)
- [x] Tapping the pill or a budget pill opens the Requests sheet: Now (with Try again / Pick another), Earlier (last three finished) and See all requests
- [x] The full list of requests is a page of its own, reachable from the sheet and from the Library tab, with a back button
- [x] When a release is grabbed the pill grows into a card that plays Swat once and shrinks back; with the sheet open Swat plays in that request's row; with reduced motion the pill says "Got it!"
- [x] After Fetch the app stays on the current page
- [x] Every new string in English and Dutch; tests for the pill, the sheet, Swat and the tab bar

## Design

Canvas boards: 13 · Top 10 tab (new tab bar + activity pill), 14 · Requests
sheet (from the pill), 9d · Swat in the activity pill (replaces 9c) —
[`docs/design/navigation.md`](../design/navigation.md)

## Notes / decisions

See [ADR 0040](../decisions/0040-navigation-activity-pill.md).

- Story numbers: the handover named this APP-12, but that ID was already
  taken (For you), so the navigation is APP-14, the Top 10 tab APP-15 and the
  low-odds warning BRK-13 / APP-16.
- Code in `apps/mobile/src/features/activity/`: `activity.ts` (pure: what the
  pill and the sheet show), `useActivity` (sheet open, seen needs-you),
  `ActivityPill`, `RequestsSheet`, `ActivityHost` (mounted in the tabs
  layout).
- "Seen" needs-you moments are kept for the app session only.
