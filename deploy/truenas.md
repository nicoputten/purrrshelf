# Server setup (milestone 0)

One-time manual setup on the NAS before any code runs. Do it in this order.
Use your own host names and paths; none are recorded in this repo.

## 1. Stop the old stack and back up

1. Stop Bookshelf first so it cannot spend indexer calls during the migration.
2. Back up the Calibre library folder and the Calibre-Web `app.db`.

## 2. Deploy Calibre-Web-Automated on the existing library

Mounts:

| Container path     | Host                                                         |
| ------------------ | ------------------------------------------------------------ |
| `/config`          | CWA config dataset                                           |
| `/calibre-library` | the existing Calibre library folder                          |
| `/cwa-book-ingest` | its own dataset (the folder empties itself after processing) |

In CWA:

- Enable Kobo sync.
- Set the auto-convert target to KEPUB for Kobo.
- Keep ingest additive.

## 3. Users and Kobo shelves

1. Create one CWA user per reader, with download permission.
2. For each user: turn on **Sync only books in selected shelves**, then create a
   shelf named `Kobo` with **Sync this shelf with Kobo device** checked.
3. For each Kobo: generate that user's sync URL and set it as `api_endpoint`
   in `.kobo/Kobo/Kobo eReader.conf`. Test with one book per device.
4. Create a CWA service account for the broker (admin, needed to edit other
   users' shelves and delete books). Put its credentials in the broker's
   `.env`, never in the repo.

## 4. SABnzbd

1. Create a category `kobopush` with its own complete folder.
2. Create an API key for the broker and put it in the broker's `.env`.

## 5. Broker volumes

| Mount              | Access     | Why                                                |
| ------------------ | ---------- | -------------------------------------------------- |
| `/data`            | read-write | broker SQLite database and logs                    |
| `/calibre-library` | read-only  | read `metadata.db` to find and list books          |
| `/cwa-config`      | read-only  | read Kobo reading and sync state from CWA's app.db |
| `/ingest`          | read-write | same dataset as CWA's `/cwa-book-ingest`           |
| `/downloads`       | read-only  | SABnzbd's `kobopush` complete folder               |

See `docker-compose.example.yml` for a starting point.

## 6. Broker accounts

Create one broker account per reader. The password is read from stdin (or
`PURRSHELF_PASSWORD`), so it never ends up in shell history or the repo:

```sh
docker exec -it <broker-container> node dist/cli-main.js user add <username> --name "<display name>" --locale nl
docker exec -it <broker-container> node dist/cli-main.js user set-password <username>
docker exec -it <broker-container> node dist/cli-main.js user list
```

**Done when:** a book added by hand to each user's `Kobo` shelf appears on the
right Kobo only.
