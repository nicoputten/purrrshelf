# Server setup (milestone 0)

One-time manual setup on the NAS. **Status: done.** This records the setup
the broker relies on ([ADR 0017](../docs/decisions/0017-cwa-setup-contract.md)).
Use your own host names and paths; none are recorded in this repo.

## 1. Retire the old stack

Calibre desktop, Calibre-Web and Bookshelf are retired. Bookshelf was stopped
first so it could not spend indexer calls during the migration, and the
Calibre library folder and the Calibre-Web `app.db` were backed up.

## 2. Calibre-Web-Automated

Calibre-Web-Automated **v4.0.8**, installed as the TrueNAS community app on
the existing library. The container runs as UID/GID **568** (`apps`).

| Container path     | Holds                                                                |
| ------------------ | -------------------------------------------------------------------- |
| `/config`          | CWA config, including `app.db`                                       |
| `/calibre-library` | the existing Calibre library                                         |
| `/cwa-book-ingest` | ingest folder on its own dataset; CWA deletes files after processing |

Settings:

- Auto-convert target: **EPUB**. The library stores EPUB; CWA's kepubify makes
  KEPUB on the fly when a Kobo syncs
  ([ADR 0016](../docs/decisions/0016-epub-in-library-kepub-at-sync.md)).
- Kobo sync enabled, "proxy unknown requests to Kobo Store" on, and the
  external port set to match the published port.
- Password policy on (min 8 characters, upper, lower, number, special).

## 3. Readers and Kobo shelves

1. One normal (non-admin) CWA user per reader, with download permission.
2. Each user has **Sync only books in selected shelves with Kobo** on and owns
   one private shelf named `Kobo` with **Sync this shelf with Kobo device** on.
   Shelf IDs differ per user; the broker looks them up by owner and name.
3. Each Kobo's `api_endpoint` in `.kobo/Kobo/Kobo eReader.conf` points at its
   own user's sync URL.

## 4. Still to do before milestone 3

- Create the broker's CWA service account (rights to edit other users' shelves
  and delete books). Put its credentials in the broker's `.env` as
  `CWA_SERVICE_USER` / `CWA_SERVICE_PASSWORD`, never in the repo.

## 5. SABnzbd (before milestone 4)

1. Create a category `kobopush` with its own complete folder.
2. Create an API key for the broker and put it in the broker's `.env`.

## 6. Broker volumes

Run the broker as `568:568` so CWA can read what it writes to ingest.

| Mount              | Access     | Why                                                |
| ------------------ | ---------- | -------------------------------------------------- |
| `/data`            | read-write | broker SQLite database and logs (owned by 568)     |
| `/calibre-library` | read-only  | read `metadata.db` to find and list books          |
| `/cwa-config`      | read-only  | read Kobo reading and sync state from CWA's app.db |
| `/cwa-book-ingest` | read-write | the same dataset as CWA's ingest folder            |
| `/downloads`       | read-only  | SABnzbd's `kobopush` complete folder               |

See `docker-compose.example.yml` for a starting point.

## 7. Broker accounts

Create one broker account per reader. The password is read from stdin (or
`PURRSHELF_PASSWORD`), so it never ends up in shell history or the repo:

```sh
docker exec -it <broker-container> node dist/cli-main.js user add <username> --name "<display name>" --locale nl
docker exec -it <broker-container> node dist/cli-main.js user set-password <username>
docker exec -it <broker-container> node dist/cli-main.js user list
```

## 8. Remote access

Expose only the broker, through Nginx Proxy Manager with HTTPS and HSTS. See
[reverse-proxy.md](reverse-proxy.md).

## 9. Indexers (milestone 4)

The indexer's URL and hourly limits live in the broker database; its API key
only in the broker's environment, as `INDEXER_<ID>_API_KEY`. Use the limits
from the indexer's API page (searches and NZB grabs separately):

```sh
docker exec -it <broker-container> node dist/cli-main.js indexer add primary --name "<indexer name>" --url https://<indexer-host> --search-limit 25 --grab-limit 25
docker exec -it <broker-container> node dist/cli-main.js indexer list
```

`indexer list` says whether the key variable is set. Adding the same id again
updates it; a lower `--priority` is queried first; `--search-limit 0` switches
an indexer off.

Optionally run `indexer caps <id>` once. It costs one search from the budget
and lets the broker use the indexer's book search (title + author) first.
