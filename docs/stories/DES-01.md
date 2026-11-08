# DES-01 Recognise Purrshelf on my phone

Status: done
Milestone: 8
Depends on: APP-01

## Story

As a reader, I want Purrshelf to have its own icon,
so that I can find it on my home screen and tell it apart from other apps.

## Acceptance criteria

- [x] The launcher icon is the "Peekaboo" cat: a ginger cat peeking over an
      open book on `#2E2836`
- [x] Android adaptive icon uses the designer's foreground layer and a flat
      `#2E2836` background, with all artwork inside the 66 dp safe zone so
      round, squircle and square masks never crop it
- [x] Android 13+ themed icons use the designer's monochrome layer (no paws)
- [x] The splash screen shows the cat and book on the app background
      (`#17141C`) instead of the Expo default
- [x] The favicon and the 512 px Play Store icon use the same artwork
- [x] Vector sources live next to the PNGs so the icon can be re-exported
- [x] None of the Expo template icons remain in the app

## Design

Canvas board: App icon final · Peekaboo — docs/design/design-choices.md
(App icon), ADR 0026

## Notes / decisions

- Splash uses the adaptive foreground PNG, because Android 12+ shows the
  splash icon inside a circle and that layer is already designed for it.
- Assets and how to regenerate them: `apps/mobile/assets/icon/README.md`.
