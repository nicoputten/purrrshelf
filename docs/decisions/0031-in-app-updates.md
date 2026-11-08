# 0031. In-app updates: APK self-update through the broker

Status: accepted
Date: 2026-11-08

## Context

The app is sideloaded. Every new version means downloading the APK from a
GitHub release and installing it by hand on each phone. Both readers use the
same phone model on the current Android version.

Two kinds of update were weighed:

- **Over-the-air JavaScript updates** (`expo-updates`). They are fast and need
  no install screen, but any native change (a new Expo module, the icon, a
  permission) still needs a new APK. Self-hosting means building Expo's update
  protocol and manifest signing into the broker. EAS Update ties the project
  to Expo's cloud.
- **APK self-update.** The app downloads the new APK and installs it. This
  covers every change, including native ones.

Android never lets a sideloaded app install itself without some user action
the first time. From Android 12 (API 31) on, an app that is the _installer of
record_ of a package can update it through `PackageInstaller` with
`setRequireUserAction(USER_ACTION_NOT_REQUIRED)`, with no confirmation screen.
From Android 14 on it can also claim update ownership.

The APK was signed with React Native's public debug key. Android only installs
an update signed with the same key as the installed app, so with a public key
anyone could build an "update". The APK also reported version 0.0.0 and
versionCode 1, so the app could not tell that it was out of date.

## Decision

- **APK self-update only.** No over-the-air JS updates.
- **Releases are signed with a private release key**, kept as GitHub Actions
  secrets and never in the repo (OPS-03). The app version comes from
  `apps/mobile/package.json` (bumped by release-please), and the versionCode is
  derived from it: `major * 1_000_000 + minor * 1_000 + patch`.
- **The app talks only to the broker** (ADR 0001 and the rule that the app has
  no server URL built in). The broker reads the newest published `mobile-v*`
  GitHub release on demand, downloads its APK once, keeps it in `/data` with
  its SHA-256, and serves the version info and the file to logged-in users
  (BRK-10). There is no timer: the broker only looks when the app asks, and it
  caches the answer.
- **The app checks on launch and from Settings**, downloads over HTTPS,
  checks the SHA-256 and opens the Android installer (APP-10). It needs
  `REQUEST_INSTALL_PACKAGES`.
- **After that first in-app install, updates skip the Install screen** on
  Android 12+ through a small native `PackageInstaller` module, and the app
  claims update ownership on Android 14+ (APP-11). If Android still asks for
  confirmation, the normal installer screen is the fallback.

## Consequences

- Switching from the debug key to the release key means each phone uninstalls
  the old app once and enters the server URL and login again.
- Losing the release key means the same reinstall again. The key needs a
  backup outside GitHub.
- The broker gains an outbound call to the GitHub API and needs the release
  repository as config (`APP_RELEASES_REPO`, off when unset).
- Security relies on Android's own signature check (an APK signed with another
  key is refused), plus HTTPS, the SHA-256 check and the broker login.
- An app that is closed cannot update itself. The update happens the next time
  it is opened.
