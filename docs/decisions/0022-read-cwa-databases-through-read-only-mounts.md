# 0022. Read CWA's databases through read-only mounts

Status: accepted
Date: 2026-11-08

## Context

The broker reads Calibre's `metadata.db` and CWA's `app.db` directly (ADR
0017, 0021) and mounts `/calibre-library` and `/cwa-config` read-only. CWA
v4.0.8 keeps both databases in WAL mode. A WAL reader normally writes to the
`-shm` file and creates `-wal` / `-shm` when they are missing, which a
read-only mount does not allow.

Checked against the real CWA v4.0.8 image through a read-only bind mount:

- While CWA runs, it keeps `-wal` and `-shm` next to the database. SQLite then
  reads with a read-only `-shm`. Reads see CWA's newest writes, including
  ones that are not checkpointed yet, and keep working across a CWA restart.
- Under heavy writes, about 1 read in 2,000 failed for a moment with
  `SQLITE_READONLY_RECOVERY`, while another connection was recovering the WAL.
- If CWA has closed a database cleanly and removed `-wal` / `-shm`, a reader
  on a read-only mount gets `SQLITE_CANTOPEN` until CWA opens it again. The
  same handle works again once CWA is back.

## Decision

- Keep both mounts **read-only**. The broker opens both databases read-only
  and never writes to them.
- Retry `SQLITE_BUSY`, `SQLITE_READONLY_RECOVERY` and `SQLITE_PROTOCOL` up to
  five times, with a short, growing pause (`ReadOnlySqlite.run`).
- Report anything else, including a database CWA has closed, as
  `LIBRARY_UNAVAILABLE`. `/health` shows `library: fail` until CWA is back.
- No `immutable=1`: it would hide CWA's changes from the broker.
- CI runs the CWA contract tests through a read-only bind mount of the test
  stack, including a CWA restart in the middle.

## Consequences

- No write access to CWA's config or library is needed for the broker.
- While CWA is stopped, the broker cannot read the library. Nothing works then
  anyway, because shelf changes and deletes go through CWA.
