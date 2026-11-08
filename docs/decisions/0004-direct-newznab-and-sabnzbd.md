# 0004. Downloads: talk to Newznab and SABnzbd directly

Status: accepted
Date: 2026-11-08

## Context

Bookshelf (a Readarr revival) searched in the background and wasted the indexer budget. We only ever want one book at a time.

## Decision

The broker talks to the Newznab indexer(s) and SABnzbd directly. Bookshelf is removed.

## Consequences

- The broker owns query planning, release scoring and failure handling.
- SABnzbd gets its own `kobopush` category and complete folder.
- No RSS sync, no "search missing", no automatic retries.
