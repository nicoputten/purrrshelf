# BRK-06 Pick, download and import the best release

Status: done
Milestone: 4
Depends on: BRK-03, BRK-05

## Story

As a reader, I want the broker to pick the best release, download it and put it in the library,
so that I don't have to judge release names myself.

## Acceptance criteria

- [x] Scoring by format, language, title/author match, size, age and grabs; previously failed releases rejected
- [x] Top score above threshold is grabbed; otherwise the list is shown
- [x] SABnzbd failure → next-best release from the same list, no new search
- [x] Importer writes a `kobopush:<request-id>` identifier into the EPUB, drops it in the ingest folder (`CWA_INGEST_PATH`, mode 0644 so CWA's UID 568 can read it) and waits for it in `metadata.db`
- [x] The broker never converts to KEPUB and expects EPUB in the library; CWA makes KEPUB at sync time
- [ ] Before this story: SABnzbd `kobopush` category and API key exist (manual)
- [x] Timeout → `import_failed` with a clear message
- [x] 100% coverage on scoring and the status machine

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0004](../decisions/0004-direct-newznab-and-sabnzbd.md), [ADR 0006](../decisions/0006-auto-pick-releases.md) and [ADR 0016](../decisions/0016-epub-in-library-kepub-at-sync.md). To verify: CWA keeps the custom `kobopush:` identifier through ingest and its metadata enforcer.

How it is built:

- Scoring (`apps/broker/src/modules/releases/scoring.ts`, 100% coverage): EPUB
  30 > KEPUB 28 > AZW3 20 > MOBI 12 > unknown 5 points; PDF, CBZ, CBR and
  audiobooks rejected. Language match +10, unknown +4, other rejected. Title:
  under 80% of the cleaned title's words rejected. Author surname +5 / −10.
  Size 0.2–50 MB fine, up to 200 MB −15, beyond rejected. Grabs and age add at
  most 5. A release that failed before is rejected. Grabbed at 60 or more
  (`ACCEPT_THRESHOLD`); reasons are stored per release for the picker.
- `ReleasePipeline` (`modules/releases/pipeline.ts`): grab (one grab from the
  budget, NZB uploaded to SABnzbd so the indexer key never reaches it), a
  `poll_download` job, then the import and a `wait_import` job.
- After a failed download the poll job grabs the next-best release of the
  same list on its own (one grab, no search). Nico agreed to this on
  2026-11-08; `test/budget-safety.test.ts` checks that only the search module
  and the CLI ever search.
- Import: the best ebook in the download (EPUB, then AZW3, then MOBI; largest
  first), size cap `MAX_BOOK_MB`. EPUBs get
  `<dc:identifier opf:scheme="kobopush">request id</dc:identifier>`, the
  form BRK-03's contract test shows CWA v4.0.8 keeps. The file is written as
  a hidden `.part`, made 0644 and renamed into `CWA_INGEST_PATH`. The broker
  waits for the identifier in `metadata.db`, falling back to title + author,
  until `IMPORT_TIMEOUT_MINUTES`.
- Without SABnzbd or CWA configured, results are scored and listed, and
  nothing is grabbed.
- Pushing to a Kobo shelf after `in_library` is APP-03/APP-06 work.
- Before this story (manual): the SABnzbd `kobopush` category and API key exist.
