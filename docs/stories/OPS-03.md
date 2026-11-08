# OPS-03 Sign releases with our own key and real version numbers

Status: done
Milestone: 9
Depends on: OPS-01

## Story

As a reader, I want every APK signed with a private key and stamped with its
real version,
so that the app can update itself safely and know when it is out of date.

## Acceptance criteria

- [x] `android.yml` signs release builds with a release keystore from GitHub
      Actions secrets (base64 keystore, store password, key alias, key
      password); nothing about the key is in the repo
- [x] A release build fails if the secrets are missing; a hand-started test
      build without them warns and falls back to the debug key
- [x] The app's version is `apps/mobile/package.json`'s version (release-please
      bumps it) and its versionCode is `major * 1_000_000 + minor * 1_000 + patch`
- [x] The release APK has a file name that carries the version
- [x] `deploy/` documents how to create the keystore, store the secrets and back
      up the key, and that each phone reinstalls once when switching keys

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0031](../decisions/0031-in-app-updates.md) and
[ADR 0028](../decisions/0028-fast-android-test-builds.md).

- Signing uses the Android Gradle Plugin's injected signing properties, written
  into the generated `android/gradle.properties` on the runner, so no config
  plugin is needed. `release.yml` passes the secrets with `secrets: inherit`.
- The version lives only in `apps/mobile/package.json`; `app.config.ts` reads it
  and `app.json` no longer carries one.
