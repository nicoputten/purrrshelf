# 0015. Styling: one token set with React Native StyleSheet

Status: accepted
Date: 2026-11-08

## Context

The build plan left styling to the design work, with NativeWind as the
default proposal. The first canvas pass styles every board inline from a small,
fixed palette, two fonts and a handful of radii. The app is on Expo SDK 58 /
React Native 0.88, and NativeWind's stable release (v4) targets older
Reanimated and Tailwind versions, while v5 is still a release candidate.

## Decision

Use one typed token set (`apps/mobile/src/theme/tokens.ts`: colours for dark
and light, spacing, radii, fonts, sizes) and plain React Native `StyleSheet`
in a small set of our own components (`AppText`, `Button`, `TextField`,
`Segmented`, `Screen`). Components read colours through `useTheme()`, so dark
and light come from the same token names.

## Consequences

- No extra Babel/Metro setup and nothing that can lag behind an Expo SDK
  upgrade.
- Tokens are plain data, so they could feed a Tailwind/NativeWind config later
  if we switch; this ADR would then be superseded.
- Screens must use tokens, never hard-coded colours.
