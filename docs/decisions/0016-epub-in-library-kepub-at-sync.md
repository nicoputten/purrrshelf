# 0016. The library stores EPUB; KEPUB is made at Kobo sync time

Status: accepted (supersedes the "auto-convert to KEPUB" requirement in the build plan and the KEPUB wording in [0003](0003-cwa-as-library.md))
Date: 2026-11-08

## Context

The build plan asked for books to be auto-converted to KEPUB in the library.
While setting up the server (milestone 0) it turned out that CWA's metadata
enforcement only works on EPUB and AZW3 files, and a KEPUB-only library is
awkward for any reader that isn't a Kobo. CWA ships kepubify and can convert
on the fly when a Kobo syncs.

## Decision

- CWA's auto-convert target stays **EPUB**. The library stores EPUB.
- KEPUB is produced **on the fly by CWA's built-in kepubify at Kobo sync
  time**.
- The broker **never converts to KEPUB** and must not expect KEPUB files in
  the library.

## Consequences

- The importer hands CWA the downloaded file (EPUB preferred, AZW3/MOBI
  converted to EPUB by CWA on ingest) and looks for the EPUB in `metadata.db`.
- Release scoring keeps EPUB > AZW3 > MOBI; no extra step for KEPUB.
- The library stays usable for non-Kobo readers and CWA can keep metadata in sync.
- Tests and fixtures must not contain KEPUB files as library content.
