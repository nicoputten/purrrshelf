# Releasing

Branches (ADR 0042):

- `develop` is the default branch. Every feature and fix lands there by
  fast-forward.
- `main` holds what was released. It only moves when a release is cut.

release-please runs on `main` and opens one release PR per component
(`broker`, `mobile`) against `main`, from the conventional commits since the
last release. Merging a mobile release PR tags `mobile-vX.Y.Z`, and
`release.yml` builds the release-signed APK and attaches it to the GitHub
release (ADR 0028, 0030, 0031). A broker release pushes the versioned image.

## Cutting a release

Several features can go out together: keep landing them on `develop` and
cut the release once everything that belongs together is there.

1. Make sure `develop` is green, then fast-forward `main` to it:

   ```sh
   git fetch origin
   git push origin origin/develop:main
   ```

   Do not land anything else on `develop` until step 4.

2. release-please opens or updates the release PRs on `main`. For mobile,
   curate the notes (below).
3. Merge each release PR by fast-forward (see below).
4. Bring `develop` up to `main`, so the release commits are on both:

   ```sh
   git fetch origin
   git push origin origin/main:develop
   ```

## Urgent fix while develop holds unreleased work

Branch from `main`, fast-forward `main` to the fix, release it, then bring
`main` into `develop`: if `develop` has not moved, fast-forward it; otherwise
merge `main` into `develop` with a local merge commit (bot identity, no
personal names).

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
the PR merged and release-please tags it. Then catch `develop` up (step 4
above).
