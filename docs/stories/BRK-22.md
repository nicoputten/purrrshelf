# BRK-22 Never call a finished download failed

Status: done
Milestone: 12
Depends on: BRK-06

## Story

As a reader, I want the broker to see that SABnzbd finished my book, so that
a download that worked is imported and not marked as failed, with every other
copy of the book thrown away after it.

## Acceptance criteria

- [x] A history slot that says Completed but has no download folder yet is read as "finishing", not as failed
- [x] A job SABnzbd briefly doesn't report (not in the queue, not in the history) is not given up at once
- [x] Both only count as a failure after 4 polls in a row (about a minute); the next-best release is tried then, as before
- [x] Downloading and Checking in the history are read as still processing
- [x] Tests first; the pipeline and SABnzbd client tests cover both cases

## Design

No screen change.

## Notes / decisions

See [ADR 0050](../decisions/0050-let-sabnzbd-settle-before-failing-a-download.md).
Found when all five releases of one book were marked failed in four minutes
while SABnzbd 5.1.3 showed all five jobs as Completed.
