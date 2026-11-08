# 0028. Fast Android test builds, APK on every mobile release

Status: accepted
Date: 2026-11-08

## Context

The Android APK workflow took about 22 to 25 minutes, and nearly all of it
(about 24 minutes) was the `assembleRelease` Gradle step. React Native and the
Expo modules compile their C++ code once per ABI, and the build made all four
(`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) on a fresh runner with no Gradle
or compiler cache. That is slow for trying out a change on a phone.

The workflow also had a `mobile-v*` tag trigger that never fired: release-please
pushes its tags with `GITHUB_TOKEN`, and GitHub does not start other workflows
for events made with that token.

## Decision

- A build started by hand from the Actions tab makes `arm64-v8a` only, which
  every current Android phone runs. All four ABIs stay one dropdown away.
- Release builds keep all four ABIs, so the release APK runs anywhere.
- The workflow caches Gradle (distribution, dependencies, build cache) with
  `gradle/actions/setup-gradle` and the native compile with ccache. Caches are
  written from `main` and read on other refs.
- `release.yml` calls `android.yml` as a reusable workflow when release-please
  creates a mobile release, and the APK is attached to that release. The tag
  trigger stays for tags pushed by hand.
- The APK is still a release build signed with the debug key (no Metro needed).

## Consequences

- A test APK takes roughly a third of the old time on a cold cache, and less
  once caches are warm. A test APK does not install on x86 emulators.
- Changes to JavaScript only still need a full APK. A development build with
  `expo-dev-client` (or EAS Update) would make those instant, at the cost of a
  second app variant and a Metro server or an Expo account; not adopted yet.
