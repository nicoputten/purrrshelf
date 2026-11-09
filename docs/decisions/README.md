# Architecture decisions

One record per decision. ADRs are never deleted or rewritten: when a decision
changes, add a new ADR and mark the old one `superseded by NNNN`.

| ADR                                                         | Decision                                                                | Status                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| [0001](0001-expo-react-native.md)                           | Mobile app: React Native with Expo                                      | accepted                   |
| [0002](0002-typescript-broker.md)                           | Backend: a TypeScript broker in Docker                                  | accepted                   |
| [0003](0003-cwa-as-library.md)                              | Library and Kobo sync: Calibre-Web-Automated behind an adapter          | accepted, amended by 0016  |
| [0004](0004-direct-newznab-and-sabnzbd.md)                  | Downloads: talk to Newznab and SABnzbd directly                         | accepted                   |
| [0005](0005-search-only-on-add.md)                          | Searching: only when a user adds a book, within a visible hourly budget | superseded in part by 0025 |
| [0006](0006-auto-pick-releases.md)                          | Release picking: auto-pick by score, with "Pick another"                | accepted                   |
| [0007](0007-metadata-providers.md)                          | Metadata: Hardcover first, plus Open Library and Google Books           | accepted                   |
| [0008](0008-two-users.md)                                   | Users: exactly two, each with their own login and Kobo                  | accepted                   |
| [0009](0009-shared-library-ownership.md)                    | Library: one shared copy per book, ownership per user                   | accepted                   |
| [0010](0010-languages-and-dark-mode.md)                     | Languages: Dutch and English books, bilingual UI, dark mode             | accepted                   |
| [0011](0011-remote-access-via-proxy.md)                     | Remote access: through the existing Nginx Proxy Manager                 | accepted                   |
| [0012](0012-no-notifications-v1.md)                         | Notifications: none in v1                                               | accepted                   |
| [0013](0013-public-repo.md)                                 | Repo: public, MIT licence, no secrets or personal data                  | accepted                   |
| [0014](0014-later-audiobooks-and-play-store.md)             | Later: audiobooks via Audiobookshelf, possible Play Store release       | accepted                   |
| [0015](0015-styling-with-tokens.md)                         | Styling: one token set with React Native StyleSheet                     | accepted                   |
| [0016](0016-epub-in-library-kepub-at-sync.md)               | The library stores EPUB; KEPUB is made at Kobo sync time                | accepted                   |
| [0017](0017-cwa-setup-contract.md)                          | The CWA setup the broker relies on                                      | accepted, amended by 0021  |
| [0018](0018-trust-only-the-proxy.md)                        | Trust X-Forwarded-For only from the proxy                               | accepted                   |
| [0019](0019-work-ids-and-metadata-merge.md)                 | Work ids and how metadata hits are merged                               | accepted                   |
| [0020](0020-covers-served-by-the-broker.md)                 | Covers are served by the broker, never hot-linked                       | accepted, amended by 0026  |
| [0021](0021-shelf-edits-via-kobo-api.md)                    | Shelf changes go through each reader's Kobo sync API                    | accepted                   |
| [0022](0022-read-cwa-databases-through-read-only-mounts.md) | CWA's databases are read through read-only mounts                       | accepted                   |
| [0023](0023-library-import.md)                              | Importing the existing Calibre library                                  | superseded by 0036         |
| [0024](0024-live-request-events.md)                         | Live request updates over a server-sent event stream                    | accepted                   |
| [0025](0025-daily-indexer-budget.md)                        | The indexer budget counts per day, not per hour                         | accepted                   |
| [0026](0026-cover-redirects.md)                             | Cover downloads follow checked redirects                                | accepted                   |
| [0027](0027-stop-on-repeated-indexer-refusals.md)           | Stop grabbing when an indexer refuses the same way twice                | accepted                   |
| [0028](0028-fast-android-test-builds.md)                    | Fast Android test builds, APK on every mobile release                   | accepted, amended by 0030  |
| [0029](0029-app-icon.md)                                    | App icon "Peekaboo"                                                     | accepted                   |
| [0030](0030-arm64-only-release-apk.md)                      | Release APKs are arm64-only too                                         | accepted                   |
| [0031](0031-in-app-updates.md)                              | In-app updates: APK self-update through the broker                      | accepted                   |
| [0032](0032-motion-with-reanimated.md)                      | Cat animations with Reanimated and SVG                                  | accepted                   |
| [0033](0033-readable-cat-styled-release-notes.md)           | Release notes are short, plain and cat-styled                           | accepted                   |
| [0034](0034-library-filters-two-rows.md)                    | Library filters are two rows: whose books, then one dropdown            | superseded by 0037 (row 2) |
| [0035](0035-recommendations-for-you.md)                     | For you: how recommendations are computed, filtered and refreshed       | accepted                   |
| [0036](0036-remove-library-import.md)                       | The one-time library import is removed                                  | accepted                   |
| [0037](0037-library-filter-and-sort.md)                     | Library: a filter and a sort dropdown, and titles under covers          | accepted                   |
| [0038](0038-budget-pill-scarcest-indexer.md)                | The budget pill shows the scarcest indexer                              | accepted                   |
| [0039](0039-genre-top-10s.md)                               | Genre top 10s from Apple Books charts and Hardcover trending            | accepted                   |

## Template

```markdown
# NNNN. Title

Status: proposed | accepted | superseded by NNNN
Date: YYYY-MM-DD

## Context

## Decision

## Consequences
```
