# Navigation: tab bar, activity pill, Requests sheet

Canvas boards: 13 · Top 10 tab (new tab bar + activity pill), 14 · Requests
sheet (from the pill), 9d · Swat in the activity pill (replaces 9c).
Story: APP-14. Why: [ADR 0040](../decisions/0040-navigation-activity-pill.md).

## Tab bar (board 13)

- Search (magnifier) · Top 10 (podium) · Library (books) · You (cat face).
  72 px high; the active tab is ginger.
- "You" is the settings screen; the app-update badge moved with it.

## Activity pill (board 13)

- Floats 12 px from the sides, just above the tab bar, on every tab. Only
  while a request is active or needs the reader.
- Active: a bobbing ginger cat, "Fetching <title>" (bold, 13), the
  percentage on the right and a 5 px ginger bar while downloading (a short
  word otherwise: "Sniffing…", "Waiting", "Adding…"), and a "+N" chip when
  more requests are running.
- Needs you: pink pill (partner colours) "<title> needs you: <reason>"
  (couldn't sniff it out, pick a release, the download failed, the library
  didn't take it). It stays until the reader opens the sheet.
- Tap: opens the Requests sheet.

## Requests sheet (board 14)

- Bottom sheet with a handle, "Requests" and "92 of 100 left today" with the
  paw. Opened from the pill or a budget pill (Search header).
- NOW: active requests and the ones that need the reader (those first). A
  row has a cover, the title and the status; downloads get a bar; not found
  gets "Couldn't sniff this one out · 4 searches" and **Try again**; choose
  release and failed downloads or imports get **Pick another**.
- EARLIER: the last three finished books, "On your Kobo · yesterday".
- "See all requests" opens the full list (the old Requests screen, now a page
  with a back button). The Library tab has a Requests button too.

## Swat in the pill (board 9d)

- When a release is grabbed the pill becomes a card: Swat (~1.6 s), then the
  title and "EPUB · 1.4 MB · English"; the card fades back into the pill.
- With the sheet open, Swat plays in that request's row instead.
- Reduced motion: the pill only says "Got it!" with the title for 1.2 s.
- Plays once per grab, wherever it plays first.
