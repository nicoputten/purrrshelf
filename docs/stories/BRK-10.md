# BRK-10 Serve the latest app version

Status: done
Milestone: 9
Depends on: OPS-03

## Story

As a reader, I want my broker to know about the newest app version,
so that the app can update itself without me visiting GitHub.

## Acceptance criteria

- [x] `GET /api/v1/app/latest` (logged in) returns `{ version, versionCode, sha256, size, notes, publishedAt }` from the newest published, non-prerelease `mobile-v*` release of `APP_RELEASES_REPO`, or `503 { code: "APP_UPDATE_UNAVAILABLE" }` when the setting is unset or GitHub fails
- [x] The broker only calls GitHub when the app asks, at most once per `APP_UPDATE_CHECK_MINUTES` (default 2; was 60, which hid a new release for up to an hour), and caches the answer
- [x] The APK is downloaded once into `/data/app-updates`, its SHA-256 is computed and checked against the release asset's digest, and older APKs are removed
- [x] `GET /api/v1/app/latest.apk` (logged in) streams that file with `Content-Type: application/vnd.android.package-archive`
- [x] Only HTTPS GitHub URLs are followed, the size is capped, and the response is validated with Zod in `packages/contract`
- [x] Tests use a fake GitHub client; `.env.example` gets placeholders

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0031](../decisions/0031-in-app-updates.md).

- Module `apps/broker/src/modules/app-updates/` (GitHub source behind the
  `AppReleaseSource` interface, `AppUpdates` service, routes). The APK goes
  through a temp file and is only kept when its size and GitHub's `sha256`
  digest match. If GitHub fails after a release is known, the broker keeps
  serving that release.
- Settings: `APP_RELEASES_REPO` (off when unset or `change-me`),
  `APP_UPDATE_CHECK_MINUTES`, `APP_UPDATES_PATH`, `MAX_APK_MB`.
