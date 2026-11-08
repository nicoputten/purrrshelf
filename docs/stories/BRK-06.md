# BRK-06 Pick, download and import the best release

Status: todo
Milestone: 4
Depends on: BRK-03, BRK-05

## Story

As a reader, I want the broker to pick the best release, download it and put it in the library,
so that I don't have to judge release names myself.

## Acceptance criteria

- [ ] Scoring by format, language, title/author match, size, age and grabs; previously failed releases rejected
- [ ] Top score above threshold is grabbed; otherwise the list is shown
- [ ] SABnzbd failure → next-best release from the same list, no new search
- [ ] Importer writes a `kobopush:<request-id>` identifier into the EPUB, drops it in the ingest folder (`CWA_INGEST_PATH`, mode 0644 so CWA's UID 568 can read it) and waits for it in `metadata.db`
- [ ] The broker never converts to KEPUB and expects EPUB in the library; CWA makes KEPUB at sync time
- [ ] Before this story: SABnzbd `kobopush` category and API key exist (manual)
- [ ] Timeout → `import_failed` with a clear message
- [ ] 100% coverage on scoring and the status machine

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0004](../decisions/0004-direct-newznab-and-sabnzbd.md), [ADR 0006](../decisions/0006-auto-pick-releases.md) and [ADR 0016](../decisions/0016-epub-in-library-kepub-at-sync.md). To verify: CWA keeps the custom `kobopush:` identifier through ingest and its metadata enforcer.
