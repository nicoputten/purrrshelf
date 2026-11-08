# Releasing

release-please opens one release PR per component (`broker`, `mobile`) from
conventional commits on `main`. Merging a mobile release PR tags
`mobile-vX.Y.Z`, and `release.yml` builds the release-signed APK and attaches
it to the GitHub release (ADR 0028, 0030, 0031).

## Mobile release notes (ADR 0033)

The release PR body becomes the GitHub release, and the in-app updater shows
it to readers. Before merging, edit the PR body so the notes make sense on a
phone:

- Keep the sections release-please writes: **New tricks**, **Fixed scratches**,
  **Faster paws**. Drop anything that only concerns the server or developers.
- One short line per change, written for the reader: what they will notice,
  not how it was built. No scopes, ticket ids, hashes or file names.
- A light cat touch is welcome (the app has a cat), never at the cost of
  clarity. Example:

  ```
  ### New tricks

  * Update Purrshelf from Settings, no more downloading by hand

  ### Fixed scratches

  * The napping cat now curls up when a search finds nothing
  * The paw loader shows on every search, not just the first
  * Book covers fill the whole e-reader screen in Delivered
  ```

The app and broker strip any leftover Markdown links, hashes and ticket ids
(`readableReleaseNotes`), but a curated PR body is the real fix.

## Merging a release PR

Merge by fast-forward. If `main` moved on, merge `main` into the release branch
first (never force-push it), then fast-forward `main` to it, so GitHub marks
the PR merged and release-please tags it.
