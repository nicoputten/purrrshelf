# 0014. Later: audiobooks via Audiobookshelf, possible Play Store release

Status: accepted
Date: 2026-11-08

## Context

Audiobooks and a store release are wanted eventually but are not part of v1.

## Decision

Keep both possible without building them now: `media_type` is on every work and request from day one, and the library sits behind an adapter so an `AudiobookshelfAdapter` can be added. The store listing would describe the app as a client for a self-hosted library server; sideloading stays the default.

## Consequences

- No migration rewrite is needed to add audiobooks.
- No store-specific code in v1.
