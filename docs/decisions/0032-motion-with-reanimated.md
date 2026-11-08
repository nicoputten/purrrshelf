# 0032. Cat animations with Reanimated and SVG

Status: accepted
Date: 2026-11-08

## Context

The designer added animations for the moments that matter (canvas boards 9,
9b and 9c): a paw-print loader, a swat when a release is grabbed, a trotting
cat on the download bar, a delivery burst, a napping cat and an "ears up"
press. They must stay smooth on a mid-range Android phone, respect reduced
motion and never get in the way.

## Decision

- Build them as React components in `apps/mobile/src/components/motion/`
  with **react-native-reanimated** (animations run on the UI thread) and
  **react-native-svg** for the shapes. No Lottie: the shapes are simple, stay
  themable in code and need no extra runtime or exported JSON files.
- Timelines are written as keyframes in milliseconds that mirror the board's
  CSS keyframes (`timeline.ts`), so a board change maps to a code change.
- **Reduced motion** (`useReducedMotion`) renders the end state only, without
  loops. One-shots keep their last frame for about 1.2 s before collapsing,
  so the moment can still be seen.
- **Loops pause** while the screen is not focused (navigation focus events).
- **One-shots play once per event.** A small in-memory store remembers, per
  scope (one request), the last event seen; only a change to a new event
  plays, and each event plays at most once per app session. The first state
  seen is only remembered.
- One-shots never take touches and their timers stop on unmount, so they
  never block navigation or input.
- Haptics come from **expo-haptics** and never fail an animation.
- Jest uses Reanimated's own mock (animations jump to their end value) and
  its resolver; `useReducedMotion` is a mock so tests can turn it on.

## Consequences

- Two native modules (reanimated with react-native-worklets, expo-haptics):
  a new APK build is needed before the animations show on a phone.
- The scene colours that are not theme tokens live in `motion` in
  `theme/tokens.ts` and are the same in light and dark mode.
- An event that happened while the app was closed never plays its one-shot.
