# APP-11 Install updates without the Install screen

Status: in review
Milestone: 9
Depends on: APP-10

## Story

As a reader, I want updates to install themselves,
so that both phones stay on the newest version without me thinking about it.

## Acceptance criteria

- [x] A local Expo native module (`apps/mobile/modules/purrshelf-installer`) installs the APK through a `PackageInstaller` session with `USER_ACTION_NOT_REQUIRED` on Android 12+ and claims update ownership on Android 14+
- [ ] Once the app installed itself the first time, later updates install without the system Install screen (to try by hand on both phones: one update with the screen, then one without)
- [x] If Android still asks for confirmation (first install, ownership lost), the system screen opens after a tap on Update; a quiet install never shows it and falls back to the Update button
- [x] A setting "Install updates automatically" (on by default): when Android will install without asking, the app downloads and verifies the update on launch and installs it when the app is left
- [x] Tests cover downloading ahead, the quiet install, the fallback and the setting

## Design

Settings "App" section: [`docs/design/settings.md`](../design/settings.md).

## Notes / decisions

See [ADR 0031](../decisions/0031-in-app-updates.md).

- The update installs when the app goes to the background, not right after
  launch, so the app does not close under the reader's thumb.
- Android does not start an app again after it updates it, so the app does not
  "restart on the new version" by itself: it is closed, and the next open runs
  the new version. The setting's hint says so.
- The first update through the new installer still shows Android's screen,
  because the 1.x APKs were installed by Android's own installer (or by
  APP-10's installer screen). After that Purrshelf is its own installer of
  record.
- Without the native module (tests, Expo Go) the app falls back to APP-10's
  installer screen.
