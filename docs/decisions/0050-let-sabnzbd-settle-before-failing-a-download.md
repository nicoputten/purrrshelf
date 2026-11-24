# 0050. Let SABnzbd settle before failing a download

Status: accepted
Date: 2026-11-24

## Context

SABnzbd's history API mixes two sources: jobs still in post-processing and
the history database. A job in post-processing is shown with an empty
`storage`, and SABnzbd sets its status to Completed a moment before it writes
the job, with its folder, to the database. Between leaving the download queue
and entering post-processing a job is also briefly in neither list.

The broker read Completed without a folder as a failed download, and a job in
neither list as lost. Both are only true for a moment, but the poll can land
in that moment every time, because each fallback grab starts the same
poll-and-download cycle again. One request burnt all five releases of a book
this way in four minutes while SABnzbd finished every one of them.

## Decision

- The SABnzbd client reports Completed without a folder as `finishing`.
- The download poll keeps polling on `finishing` and `missing`, counting the
  polls in a row in the job payload. Only the 4th (`SETTLE_POLLS`, about a
  minute at the 15 s poll interval) fails the download and tries the next
  release, with the same messages as before.
- Downloading and Checking in the history count as still processing.

## Consequences

- A finished download is imported instead of thrown away.
- A download SABnzbd really lost is given up about a minute later than
  before. No indexer call is added: the fallback grab is unchanged.
