# 0029. App icon "Peekaboo"

Status: accepted
Date: 2026-11-08

## Context

The app still shipped Expo's template icon, adaptive icon and splash image.
The designer added a final app icon to the UX canvas (board "App icon final:
Peekaboo") with matching export files.

## Decision

- The app icon is a ginger cat (`#F6A65A`) peeking over an open book
  (`#F4EFEA` / `#E4D8CA`) with pink inner ears (`#F7B6C2`) and eyes in the
  app background colour (`#17141C`).
- Android adaptive icon: a transparent foreground layer on a flat
  `#2E2836` background colour (the `surfaceRaised` token). No background
  image. All artwork stays inside the 66 dp safe zone of the 108 dp canvas.
- A separate monochrome layer for Android 13+ themed icons leaves out the
  paws and cuts the eyes and the book's spine out of the shape.
- The splash screen reuses the adaptive foreground on the app background
  `#17141C`.
- All icon files live in `apps/mobile/assets/icon/`, with the SVG sources in
  `source/`.

## Consequences

- Changing the icon means re-exporting from the SVG sources and replacing the
  PNGs; `app.json` paths stay the same.
- A new APK build is needed before the icon shows on a phone.
