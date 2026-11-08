# App icon "Peekaboo"

Android adaptive icon on a 108 × 108 canvas, artwork inside the 66 dp safe
zone. See ADR 0027 and story DES-01.

| File                                                                                             | Used for                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `icon.png` (1024)                                                                                | Expo `icon`                                                  |
| `adaptive-icon-foreground.png`                                                                   | `android.adaptiveIcon.foregroundImage` (1024, transparent)   |
| `adaptive-icon-monochrome.png`                                                                   | `android.adaptiveIcon.monochromeImage` (Android 13+ themed)  |
| `splash-icon.png`                                                                                | `expo-splash-screen` image (copy of the adaptive foreground) |
| `favicon.png` (48)                                                                               | `web.favicon`                                                |
| `play-store-icon-512.png`                                                                        | Play Store listing icon (not used by the build)              |
| `source/ic_launcher_foreground.svg`, `source/ic_launcher_monochrome.svg`, `source/icon_full.svg` | Vector sources                                               |

Adaptive icon background colour: `#2E2836` (set in `app.json`).

Palette: ginger `#F6A65A`, pages `#F4EFEA` / `#E4D8CA`, inner ears
`#F7B6C2`, eyes `#17141C`.
