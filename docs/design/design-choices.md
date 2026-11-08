# Design choices

Source: the UX canvas "Kobo Push App — UX first pass" (six boards, dark mode).
This file records the look and feel so the app can be built from it. New
designs go to the canvas as **new boards**; existing boards are not edited.
When a screen changes, update its file in this folder in the same PR.

## Name and personality

- The app is called **Purrshelf**. The theme is a cat that fetches books: warm,
  playful, never cutesy at the expense of clarity.
- Status and cost are always stated plainly; the cat jokes live in headings and
  step names, never in numbers or errors.

## Colour (dark, primary theme)

All colours come from one token set (`apps/mobile/src/theme/tokens.ts`); see ADR 0015.

| Token                   | Hex                   | Used for                                            |
| ----------------------- | --------------------- | --------------------------------------------------- |
| `background`            | `#17141C`             | screen background                                   |
| `scrim`                 | `#0E0C11`             | behind bottom sheets                                |
| `surface`               | `#231F2A`             | cards, search field, tab bar, sheets                |
| `surfaceMuted`          | `#1C1922`             | de-emphasised cards ("2 left out")                  |
| `surfaceRaised`         | `#2E2836`             | pills, info boxes, progress track, dividers         |
| `border`                | `#4A4254`             | outlined buttons and chips, empty step circles      |
| `text`                  | `#F4EFEA`             | primary text                                        |
| `textBody`              | `#D9D2E0`             | long-form text (descriptions)                       |
| `textMuted`             | `#B9B0C2`             | secondary text, inactive tabs                       |
| `accent`                | `#F6A65A`             | primary buttons, active tab, focus border, progress |
| `accentPressed`         | `#FFC48A`             | pressed/hover state of accent links                 |
| `onAccent`              | `#2A1606`             | text on accent                                      |
| `success` / `successBg` | `#8FD8C8` / `#1F3A35` | "On your Kobo", done steps, "In library"            |
| `onSuccessBg`           | `#CDEFE7`             | body text on success background                     |
| `partner` / `partnerBg` | `#F7B6C2` / `#3A2530` | "Partner has it", "Partner's", "Both"               |
| `mine` / `mineBg`       | `#F6C38F` / `#3A2E1F` | "Yours", "Language differs" warning                 |

Placeholder cover colours (muted, picked per book from its id):
`#4A5B3F #5B3F4F #3F4A5B #5B4A3F #3F5B54 #57503A #4F3F5B #5B453F #3F535B`.

**Light theme:** not on the canvas. The app derives one from the same token
names (warm off-white background, the same accent and badge hues darkened for
contrast) so the theme switch works; it needs a canvas board before it is
considered designed.

## Type

- **Fredoka** 500/600 for headings, book titles, logo and placeholder cover titles.
- **Nunito** 400/600/700 for everything else.
- Scale used on the canvas: 30 (home heading), 28 (screen title), 22 (detail
  title), 20 (sheet title), 17 (section titles, primary button), 16 (card
  title), 15/14 (body, buttons), 13 (secondary), 12 (badges, tab labels).

## Shape and spacing

- Screen padding 20; gaps of 8 / 12 / 14 / 16.
- Radii: pills 999, cards 20–22, inputs 20, buttons 14–18, covers 10–14,
  bottom sheet top 28.
- Minimum touch target 44×44. Primary call to action is 56 high, full width.
- Search field: 56 high, 2 px accent border.

## Cat motifs

- **Logo:** line-drawn cat face next to the word Purrshelf.
- **App icon ("Peekaboo", ADR 0029):** a ginger cat peeking over an open
  book on `#2E2836`; the splash shows the same cat and book on `#17141C`.
  Files and palette: `apps/mobile/assets/icon/README.md`.
- **Cat ears:** two small triangles on top of the search field, the detail
  cover and the add sheet.
- **Paw print:** the indexer-budget icon, the Search tab icon and the
  progress thumb on the reading bar.
- **Walking cat** rides the download progress bar (Trot, see Motion).
- **Sleeping cat (zzz)** for "couldn't find it", waiting for a free search
  and empty library tabs (Nap, see Motion).
- **Paw prints** step in turn wherever something loads (PawLoader).
- **Happy cat face** for "on your Kobo".
- **Placeholder cover:** title on a coloured card with the cat ears, used while
  loading and when no cover exists.

## Tone of copy

- Home heading: "What are we reading next?"
- Cost is never hidden: "looking costs nothing, only **Add** uses a search",
  "Uses 1 search, up to 4 if the first sniff misses", "21 of 25 searches left
  today", "Try again · up to 4".
- Step names use cat verbs: "Sniffed it out", "Picked the best match",
  "Couldn't sniff this one out", "Fetch this book?", "Fetch it now".
- Kobo sync is honest: "On your Kobo after its next sync".
- Dutch copy follows the same tone; it is translated, not literal.

## Interaction choices (first pass)

- **Home is search-first.** One field, language chips (Any language / English
  / Nederlands), results with badges.
- **Bottom tab bar** with four tabs: Search, Library, Requests, Settings
  (72 high, active tab in accent).
- **Budget pill** in the header of Search and Requests ("21 / 25 left"); it
  links to Requests.
- **Explicit buttons** for push and remove (Send / Remove per Kobo), not
  swipes or long-press.
- **Partner's library is a tab** (Mine / Partner's / All, with counts), and
  ownership also shows as badges.
- **Reading progress** is a thin bar under each cover plus a status line
  ("42% read", "Unread", "Finished").
- **Release picker** explains each option in one line (format, size,
  language, match) and groups what was left out with the reason.
- **Add** opens a bottom sheet: language (remembered), Kobo targets, cost,
  then "Fetch it now" / "Not now".

## Icon

Canvas board: 8 · App icon final: Peekaboo (DES-01, ADR 0029).

- A ginger cat (`#F6A65A`) peeking over an open book (`#F4EFEA` / `#E4D8CA`),
  pink inner ears (`#F7B6C2`), eyes in the app background colour
  (`#17141C`).
- Android adaptive icon: transparent foreground on a flat `#2E2836`
  (`surfaceRaised`) background, all artwork inside the 66 dp safe zone.
- Monochrome layer for Android 13+ themed icons: no paws, eyes and the book's
  spine cut out of the shape.
- Splash: the adaptive foreground on `#17141C`.
- Files and SVG sources: `apps/mobile/assets/icon/`.

## Motion

Canvas boards: 9 · Motion: little cat moments (items 1, 3, 4, 5, 6),
9b · Pounce v2: Swat (replaces item 2 "Pounce"), 9c · Swat in the Requests
screen (DES-02, ADR 0032). Components: `apps/mobile/src/components/motion/`.

Colours: ginger `#F6A65A`, pink `#F7B6C2`, mint `#8FD8C8`, cream `#F4EFEA`
(token `motion` in `theme/tokens.ts`, the same in light and dark).

| Moment        | Component    | Where                                                         | Motion                                                                                                                                                                                  |
| ------------- | ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Sniffing  | `PawLoader`  | every loading state (replaces all spinners, also in buttons)  | three paw prints step in turn: scale 0.6 → 1 and opacity 0.15 → 1, 0.25 s apart, 1.5 s loop                                                                                             |
| 2 · Swat      | `Swat`       | request card, under the title, when a release is grabbed      | one-shot, about 1.6 s: tail swish loop, two paw taps (book wobbles ±7°), wind-up, swat, book tumbles to 90° into a basket that squash-bounces, "Got it!" pops; then the scene collapses |
| 3 · Trot      | `Trot`       | download progress bar                                         | cat runs on the bar at the real progress (0.6 s catch-up), 0.22 s bob loop while downloading                                                                                            |
| 4 · Delivered | `Delivered`  | request card at "On your Kobo"; Kobo card after Send succeeds | one-shot: cover springs down into an e-reader, four paw-print confetti (ginger, pink, mint, ginger) burst out; collapses after 1.8 s                                                    |
| 5 · Nap       | `Nap`        | not found, waiting for the daily budget, empty library tabs   | cream cat breathes (scaleY 1 → 1.05, 1.8 s alternate), three Zs float up 0.9 s apart                                                                                                    |
| 6 · Ears up   | `EarsButton` | primary actions: Fetch it now, Add to my library, Send        | on press the button squishes to 0.9 and springs back, two ears spring up from behind it for 0.7 s, a pink heart floats up                                                               |

Rules:

- **Reduced motion** (the phone's setting): only the end state, no loops.
  Swat and Delivered show their last frame (book in the basket with "Got
  it!", cover on the e-reader) for about 1.2 s, then collapse.
- **Never in the way:** one-shots take no touches and never delay a press or
  navigation; loops pause while their screen is not focused.
- **Once per event:** Swat plays once per grab (a new release counts as a new
  grab) and Delivered once per confirmed push, never on re-render or when
  coming back to a screen. A state the app first sees on opening a screen
  only counts as the starting point.
- **Haptics:** light on each Swat tap, medium on the landing, success on
  Delivered.
- Animations are decorative: the text next to them carries the meaning;
  Swat and Delivered have a short screen-reader label.

## Screens

| Board | Screen               | File                                                   |
| ----- | -------------------- | ------------------------------------------------------ |
| —     | Onboarding and login | [onboarding.md](onboarding.md) (not on the canvas yet) |
| 1     | Search (home)        | [search.md](search.md)                                 |
| 2     | Book detail          | [book-detail.md](book-detail.md)                       |
| 3     | Add to library       | [add-sheet.md](add-sheet.md)                           |
| 4     | Requests & progress  | [requests.md](requests.md)                             |
| 5     | Pick another release | [release-picker.md](release-picker.md)                 |
| 6     | Library              | [library.md](library.md)                               |
| —     | Import library       | [import.md](import.md) (not on the canvas yet)         |
