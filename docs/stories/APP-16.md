# APP-16 See a warning before I spend searches on a hard book

Status: todo
Milestone: 11
Depends on: BRK-13

## Story

As a reader, I want the Add sheet to tell me when a book will probably not be
found, and why,
so that I can pick the English edition or wait instead of wasting searches.

## Acceptance criteria

- [ ] The Add sheet asks the broker for the preview and shows one warning card above the button when there is a reason; it follows the chosen language
- [ ] The card has the sleepy cat, a title and one line per reason (board 3c); "Not found last time" names the date
- [ ] "Dutch books are hard to find" shows "Try the English edition instead" only when an English edition is known; it switches the sheet to English (or opens that edition)
- [ ] With a warning the button reads "Fetch it anyway"; nothing is blocked, and a failed preview shows no warning
- [ ] Every new string in English and Dutch

## Design

Canvas boards: 3b · Add sheet: Dutch book warning, 3c · Low odds warning:
all reasons — [`docs/design/add-sheet.md`](../design/add-sheet.md)

## Notes / decisions

See [ADR 0041](../decisions/0041-low-odds-warning.md). "Remind me in 2 weeks"
(board 3c, new books) is left out for now, as the handover allowed.
