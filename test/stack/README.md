# Integration test stack

Real services for the adapter contract tests. Placeholder values only.

## CWA (pinned)

`crocodilestick/calibre-web-automated:v4.0.8`, the version running on the
server. `deploy/docker-compose.example.yml` must use the same tag; a broker
test fails if they drift. Upgrade both together, after the contract tests pass
on the new version.

## Fixture (built with BRK-03)

The fixture recreates the server setup from
[ADR 0017](../../docs/decisions/0017-cwa-setup-contract.md):

- Kobo sync enabled, "proxy unknown requests to Kobo Store" on.
- Two readers, `reader-a` and `reader-b`: normal (non-admin) users with
  download permission and "Sync only books in selected shelves with Kobo" on.
- One private shelf named `Kobo` per reader, with "Sync this shelf with Kobo
  device" on. The shelves get different IDs, so tests prove the adapter looks
  them up per owner.
- A broker service account with the rights to edit other users' shelves and
  delete books.
- Passwords meet CWA's policy (min 8, upper, lower, number, special) and are
  generated per run, never committed.
- Library content: public-domain EPUBs from `test/fixtures/`, no KEPUB files.
