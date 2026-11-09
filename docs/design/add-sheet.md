# Add to library (bottom sheet)

Canvas board: 3 · Add to library. Stories: APP-03.

- Bottom sheet over a dark scrim, top radius 28, cat ears on the sheet, grab handle.
- Cover + "Fetch this book?" + title · author.
- Language: segmented English / Nederlands (radio group), remembered.
- "When it arrives, send it to": checkboxes Your Kobo (checked) / Partner's Kobo.
- Cost box with paw: "Uses **1 search**, up to 4 if the first sniff misses."
  and "21 of 25 searches left today."
- Primary: **Fetch it now** (56 high). Secondary text button: Not now.
- Already in the library: no cost box; adding only records ownership.

Built (APP-03):

- One sheet for the whole app, opened by Add on a search result, "Add to
  library" on the book page and "Add next in series".
- Language defaults to the book's own language, else the last pick (remembered
  on the phone), else the app language.
- One checkbox per reader linked to CWA: "Your Kobo" (ticked) and "Reader
  Two's Kobo". Without any linked Kobo the sheet says the book goes to the
  library only.
- The cost box says "up to 4" per indexer with a search budget, and "21 of 25
  searches left today". Without an indexer it explains why Fetch is off.
- Already in the library: title "Add to your library?", no language or cost,
  button "Add to my library".
- After Fetch the sheet closes and the app opens Requests.

Motion (DES-02): "Fetch it now" and "Add to my library" are ears-up buttons
(squish, ears pop up, a heart floats up); the press goes through at once.
Loading parts of the sheet show the paw-print loader.

## Low-odds warning (APP-16)

Canvas boards: 3b · Add sheet: Dutch book warning, 3c · Low odds warning: all
reasons. Broker: BRK-13, [ADR 0041](../decisions/0041-low-odds-warning.md).

- Shown above the button, under the cost box, only when the broker's preview
  (`GET /requests/preview`) returns a reason. Only the strongest reason shows.
- Card: warm brown background with a darker ginger border, radius 16, sleepy
  cat (closed eyes) on the left, a bold title and one line of text.
  Colours are theme tokens (`warningSurface`, `warningBorder`, `warningText`,
  `warningLink`); light mode uses a pale ginger card with brown text.
- With a warning the button reads **Fetch it anyway**; it is never disabled
  by the warning.
- The preview follows the language picker: switching to Nederlands can bring
  up the Dutch warning, switching back to English takes it away.
- Texts (English; Dutch in the app's `nl` strings):
  - Not found last time: "We tried on 2 November and found nothing. Chances
    are low it turned up since."
  - We barely know this book: "There's no ISBN or edition info, so it's hard
    to search for well. Expect no result."
  - This one is very new: "New books often take a few weeks to turn up.
    Trying now may cost searches for nothing."
  - Dutch books are hard to find: "Few Dutch ebooks get shared, so this often
    ends with "couldn't sniff this one out". Don't count on it." Link **Try
    the English edition instead** switches the picker to English (or opens the
    English edition's sheet); hidden when no English edition is known.
  - A rare one: "Few people read this, so few copies get shared. It may not
    be out there."
- Not built: "Remind me in 2 weeks" on the new-book warning (ADR 0041).
