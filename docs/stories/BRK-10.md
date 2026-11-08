# BRK-10 Serve the latest app version

Status: todo
Milestone: 9
Depends on: OPS-03

## Story

As a reader, I want my broker to know about the newest app version,
so that the app can update itself without me visiting GitHub.

## Acceptance criteria

- [ ] `GET /api/v1/app/latest` (logged in) returns `{ version, versionCode, sha256, size, notes, publishedAt }` from the newest published, non-prerelease `mobile-v*` release of `APP_RELEASES_REPO`, or `{ code: "app_update_unavailable" }` when the setting is unset or GitHub fails
- [ ] The broker only calls GitHub when the app asks, at most once per `APP_UPDATE_CHECK_MINUTES` (default 60), and caches the answer
- [ ] The APK is downloaded once into `/data/app-updates`, its SHA-256 is computed and checked against the release asset's digest, and older APKs are removed
- [ ] `GET /api/v1/app/latest.apk` (logged in) streams that file with `Content-Type: application/vnd.android.package-archive`
- [ ] Only HTTPS GitHub URLs are followed, the size is capped, and the response is validated with Zod in `packages/contract`
- [ ] Tests use a fake GitHub client; `.env.example` gets placeholders

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0031](../decisions/0031-in-app-updates.md).
