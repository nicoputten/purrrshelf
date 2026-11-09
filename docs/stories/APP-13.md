# APP-13 Add a suggested book, instantly when my partner has it

Status: in review
Milestone: 10
Depends on: APP-12

## Story

As a reader, I want the book page to tell me why a book was suggested and
to add my partner's books without a download,
so that I can trust the pick and get it on my Kobo right away.

## Acceptance criteria

- [x] Opened from For you, the book page shows a ginger banner with the reason ("For you · From <partner>'s shelf, <partner> finished it")
- [x] For a book my partner owns, the action card says "Instant. <partner> already has the file." and "Uses no searches and no downloads", with "Also send to your Kobo" (on by default) and "Add to my library" (EarsButton)
- [x] For other books the normal Add sheet and budget pill apply, unchanged
- [x] Every new string in English and Dutch

## Design

Canvas boards: 11 · Book page from For you (partner's book), 2 · Book detail,
3 · Add sheet, 9 · Motion — [`docs/design/for-you.md`](../design/for-you.md)

## Notes / decisions

See [ADR 0035](../decisions/0035-recommendations-for-you.md). Adding a
partner's book uses the existing keep and send-to-Kobo endpoints (APP-06,
BRK-08); no new broker work.

The card passes nothing but `from=for-you` to the book page; the page reads
the reason from the cached For you list (agreed with APP-12). Taking the
partner's book calls keep first, then send to my Kobo if ticked; the tick is
hidden when my Kobo isn't set up.
