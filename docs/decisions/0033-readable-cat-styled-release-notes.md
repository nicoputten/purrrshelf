# 0033. Release notes are short, plain and cat-styled

Status: accepted
Date: 2026-11-08

## Context

The in-app updater (ADR 0031) shows the GitHub release notes of a mobile
release. release-please writes those notes for developers: a version heading
with a compare link, "Features" and "Bug Fixes" headings, conventional-commit
scopes, ticket ids and commit links. On the phone that read as noise, and
server-only lines (`broker`) meant nothing to a reader.

## Decision

- Mobile changelog sections are named in the app's voice in
  `release-please-config.json`: **New tricks** (feat), **Fixed scratches**
  (fix, revert) and **Faster paws** (perf). Other commit types are hidden.
- `readableReleaseNotes` in `packages/contract` turns release notes into plain
  text: no version heading, links, commit hashes, scopes or ticket ids, and no
  `broker` lines. The broker applies it before serving the notes, and the app
  applies it again so an older broker still shows tidy notes.
- Before a mobile release PR is merged, its notes (the PR body, which becomes
  the GitHub release) are edited into short, user-facing, gently cat-flavoured
  lines, following `docs/releases.md`.

## Consequences

- Readers see what changed for them, in the same voice as the rest of the app.
- Commit subjects for `mobile` should already read as user-facing sentences;
  the release PR edit only polishes them.
- The CHANGELOG file keeps commit links for developers; only the release notes
  shown in the app are plain.
