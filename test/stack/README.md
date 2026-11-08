# Integration test stack

Real services for the adapter contract tests. Placeholder values only.

## CWA (pinned)

`crocodilestick/calibre-web-automated:v4.0.8`, the version running on the
server. `deploy/docker-compose.example.yml` must use the same tag; a broker
test fails if they drift. Upgrade both together, after the contract tests pass
on the new version.

## Fixture

`apps/broker/test/contract/cwa-fixture.ts` starts this stack and recreates the
server setup from [ADR 0017](../../docs/decisions/0017-cwa-setup-contract.md)
and [ADR 0021](../../docs/decisions/0021-shelf-edits-via-kobo-api.md):

- Kobo sync enabled, "proxy unknown requests to Kobo Store" on.
- Two readers, `reader-a` and `reader-b`: normal (non-admin) users with
  download permission and "Sync only books in selected shelves with Kobo" on,
  each with a Kobo sync token.
- One private shelf named `Kobo` per reader, with "Sync this shelf with Kobo
  device" on. reader-a owns another shelf too, so the Kobo shelf IDs differ
  from each other and from the user IDs: tests prove the adapter looks them up
  per owner.
- A broker service account with download and delete-books rights only.
- Passwords meet CWA's policy (min 8, upper, lower, number, special) and are
  generated per run, never committed. They are written with the rest of the
  fixture to `$CWA_STACK_DIR/fixture.json`, outside the repo.
- Library content: two invented EPUBs (`apps/broker/test/fixtures/epub.ts`)
  dropped into the ingest folder, so CWA imports them the way it will import
  the broker's downloads. No KEPUB files.

Run it locally (needs Docker):

```sh
export CWA_STACK_DIR=$PWD/.cwa-stack   # git-ignored
pnpm --filter @purrshelf/contract build
pnpm --filter @purrshelf/broker cwa:fixture
pnpm --filter @purrshelf/broker test:contract
docker compose -f test/stack/docker-compose.yml down -v && rm -rf .cwa-stack
```

The contract tests are skipped when `CWA_STACK_DIR` is not set, so
`pnpm test` works without Docker.
