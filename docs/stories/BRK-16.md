# BRK-16 Make sure every book on my Kobo shelf reaches my Kobo

Status: in review
Milestone: 12
Depends on: APP-06, OPS-04

## Story

As a reader, I want a book on my Kobo shelf to really land on my Kobo, even
when a sync went wrong, so that I never have to notice and fix it myself.

## Acceptance criteria

- [x] A book counts as on my Kobo only when my Kobo downloaded it or reported
      a reading position for it; a book CWA marked synced without that shows
      as "sending" in the app
- [x] Every 10 minutes the broker finds such books for each linked reader and,
      after 30 minutes, resends them: off the Kobo shelf, a sync clears CWA's
      mark, back on the shelf, the next sync sends it
- [x] A book that arrives (on its own or after a resend) is left alone; after
      3 failed resends the broker stops and logs a warning
- [x] Taking the book off my Kobo in the app stops the resend; a book the
      broker took off the shelf still shows as "sending"
- [x] Only the Kobo shelf API is used: no writes to CWA's databases, no new
      CWA rights, no indexer calls
- [x] `purrshelf kobo status [<username>]` lists, per reader, the books that
      have not reached their Kobo yet and what the broker is doing about them
- [x] The contract tests show, against the pinned CWA image, that a Kobo
      download marks the book delivered

## Design

No canvas board: the app's existing "sending" state covers it.

## Notes / decisions

- [ADR 0046](../decisions/0046-resend-books-the-kobo-never-received.md): how
  CWA decides what to send, why "off the shelf and back on" (Nico's choice)
  and the alternatives.
- Books lost in the first away-from-home syncs (OPS-04) were fixed by hand;
  this story catches the next ones.
