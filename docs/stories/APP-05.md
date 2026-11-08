# APP-05 Follow a request and pick another release

Status: done
Milestone: 4
Depends on: APP-03

## Story

As a reader, I want to follow a request live and swap the release if the pick looks wrong,
so that I stay in control without spending extra searches.

## Acceptance criteria

- [x] Requests screen shows each step live over SSE
- [x] "Pick another" opens the release list from the search already done (free)
- [x] Release picker explains format, size, language and why items were left out
- [x] Not found shows "Try again" with its cost

## Design

Canvas boards: 4 · Requests & progress, 5 · Pick another release — `docs/design/requests.md`, `docs/design/release-picker.md`

## Notes / decisions

- The live stream is `GET /requests/events` (ADR 0024). While it is down the
  screen polls, as in APP-03.
- "Pick another" lists the stored results of the search already done
  (`GET /requests/:id/releases`), so browsing costs nothing. Picking stops a
  running download and spends one grab, never a search.
- Left-out releases can still be shown and used, except one that already
  failed.
- Try again shows its maximum cost: 4 searches per indexer with a budget.
  Dismiss cancels the request (and stops a download) and hides it.
- Cards: steps for a request on its way, a not-found card with Try again and
  Dismiss, and a short finished card.
