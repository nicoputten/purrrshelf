# 0042. Features land on develop; a release fast-forwards main

Status: accepted
Date: 2026-11-09

## Context

Feature PRs landed on `main` by fast-forward, and release-please on `main`
opened a release PR as soon as a `feat` or `fix` arrived. Several stories that
belong together (the genre Top 10 and the low-odds warning) should reach
readers in one release, and a half-finished set on `main` blocked any urgent
fix from shipping on its own. We also keep history linear: no GitHub merge
commits, so no personal names end up in it.

## Decision

- A long-lived `develop` branch is the default branch. Every feature and fix
  PR targets `develop` and lands on it by fast-forward, as before.
- `main` only moves when we cut a release: fast-forward `main` to `develop`.
  release-please runs on `main` only and opens its release PRs against `main`
  (`target-branch: main` in `release.yml`, needed because it otherwise follows
  the default branch).
- After a release PR lands on `main`, fast-forward `develop` to `main`, so the
  release commit (versions, changelogs, manifest) is on both branches and the
  next fast-forward of `main` works. Nothing lands on `develop` between
  fast-forwarding `main` and catching `develop` up.
- CI runs on pushes to both branches. The broker `edge` image follows
  `develop`; versioned images and the release APK still come only from a
  release on `main`.
- Urgent fix while `develop` holds unreleased work: land the fix on a branch
  from `main`, fast-forward `main` to it, release, then bring `main` into
  `develop` (rebase local unpushed work, or a merge commit made with the bot
  identity if `develop` already moved on).

## Consequences

- A release contains exactly what was on `develop` when `main` was moved, and
  its notes list every feature in it.
- Open PRs from before the switch must be retargeted to `develop`.
- The repo's default branch and any branch rules are set by the owner in the
  GitHub settings; the workflows do not depend on them beyond `target-branch`.
- Gradle caches are written from the default branch (`develop`); release
  builds on `main` read them.
