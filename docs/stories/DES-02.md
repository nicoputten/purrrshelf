# DES-02 Little cat moments

Status: done
Milestone: 8
Depends on: APP-03, APP-05, APP-06, DES-01

## Story

As a reader, I want small cat animations at the moments that matter
(looking, grabbing, downloading, delivering, waiting),
so that the app feels alive and I can tell at a glance what just happened.

## Acceptance criteria

- [x] Motion components live in `apps/mobile/src/components/motion/`, built with
      react-native-reanimated (UI thread) and react-native-svg; no Lottie
- [x] Shapes and colours follow boards 9, 9b and 9c (ginger `#F6A65A`, pink
      `#F7B6C2`, mint `#8FD8C8`, cream `#F4EFEA`)
- [x] **PawLoader** ("Sniffing"): three paw prints with staggered scale and
      opacity, 1.5 s loop; it replaces every `ActivityIndicator`
- [x] **Swat** (board 9b/9c, replaces Pounce): one-shot when a release is
      grabbed (request → downloading). Cat loaf on a table edge with a tail
      swish loop; the paw taps twice (book wobbles ±7°), winds up and swats;
      the book tumbles off (translate + rotate to 90°) into a basket that
      squash-bounces, then "Got it!" pops. About 1.6 s, inside the request
      card under the title, then it collapses so the step list shows.
      Haptics: impactLight on each tap, impactMedium on landing
- [x] **Trot**: a cat on the download progress bar; its position follows real
      progress from the live events (withTiming), with a 0.22 s bob loop while
      downloading
- [x] **Delivered**: one-shot when the push to a Kobo is confirmed (request
      reaches "On your Kobo", or Send on the book page succeeds). The cover
      drops into an e-reader with a spring and four paw-print confetti burst
      out; notificationAsync(Success) haptic
- [x] **Nap**: sleeping cat breathing (scaleY 1 → 1.05, 1.8 s alternate) with
      three staggered floating "z"; used for not found, waiting for the daily
      budget and empty library tabs
- [x] **EarsButton**: wraps primary buttons (Fetch it now, Send). On press the
      button scales to 0.9 and springs back, two ears spring up from behind
      it and a small heart floats up
- [x] Reduced motion (`useReducedMotion`): only the end state, no loops.
      Swat and Delivered show their last frame for about 1.2 s so it can be
      seen, then collapse
- [x] One-shots never block navigation or input (no touch handling, timers
      stop on unmount); loops pause while the screen is not focused
- [x] Swat and Delivered play once per event, never again on re-render or
      when coming back to the screen
- [x] Component tests cover the reduced-motion end states and that each
      one-shot fires once per status change

## Design

Canvas boards: 8 · App icon final: Peekaboo, 9 · Motion: little cat moments
(items 1, 3, 4, 5, 6), 9b · Pounce v2: Swat, 9c · Swat in the Requests
screen — `docs/design/design-choices.md` (Icon, Motion),
`docs/design/requests.md`. ADR 0032.

## Notes / decisions

- One-shots remember, per request, the last event they saw for the app
  session. The first state the app sees is only remembered (it happened
  before we looked), so a download that was already running doesn't swat.
  A request added in this session is remembered from the start, so its grab
  plays even if Requests opens later. After an app restart nothing replays.
- A grab is named by its release: Pick another on a running download is a
  new grab and swats again.
- With reduced motion, Swat still gives the landing haptic (not the two taps)
  and Delivered the success haptic.
- Nap stands in for "budget empty" on the request card while a request waits
  for a free search; there is no separate budget-empty screen.
- The app icon itself is DES-01 (ADR 0029); this story only adds its
  "Icon" section to the design choices.
