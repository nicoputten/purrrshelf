# Changelog

## 1.0.0 (2026-11-08)


### Features

* **broker:** accounts, login with rotating refresh tokens, /me and health checks (BRK-01) ([e3fb681](https://github.com/nicoputten/purrrshelf/commit/e3fb68175bfc5e993b8a2a5a3f4527f8ad4e2781))
* **broker:** add, list and follow requests; own and shelve finished books (APP-03) ([cea86ae](https://github.com/nicoputten/purrrshelf/commit/cea86ae9b7121ae7bf9567f689a20338c1be0e82))
* **broker:** count the indexer budget per day instead of per hour ([0222d92](https://github.com/nicoputten/purrrshelf/commit/0222d92505c03d5be840c51ed19ce97a172bb614))
* **broker:** delete books nobody owns after 7 days (BRK-08) ([9ab0e68](https://github.com/nicoputten/purrrshelf/commit/9ab0e689936fe247261cb72cbe7daa583c32fc8d))
* **broker:** expose the broker through Nginx Proxy Manager (OPS-02) ([731cb63](https://github.com/nicoputten/purrrshelf/commit/731cb630872ea8bcc0b66248d5f2a56be3f5f09f))
* **broker:** find library books by any Calibre identifier (BRK-03) ([ff9a816](https://github.com/nicoputten/purrrshelf/commit/ff9a816d4e8b8e3c271e936495bfb9d1f479e9c9))
* **broker:** import the existing Calibre library and assign owners (BRK-09) ([840e359](https://github.com/nicoputten/purrrshelf/commit/840e3593ac0d81279921677608a96867eb312b4e))
* **broker:** pick another release, try again, cancel and live request events (APP-05) ([79ace7d](https://github.com/nicoputten/purrrshelf/commit/79ace7dea021a16e8e2d6981be397a15503eba8c))
* **broker:** pick, download and import the best release (BRK-06) ([ed7c40c](https://github.com/nicoputten/purrrshelf/commit/ed7c40c0f84788987ebaeaaf6a3b877c47a57236))
* **broker:** read and change Kobo shelves through CWA (BRK-03) ([95ce930](https://github.com/nicoputten/purrrshelf/commit/95ce930c15bb450ea2b1c7ae55ee1f7bd6caef38))
* **broker:** search book metadata from Hardcover, Open Library and Google Books (BRK-02) ([c3ef700](https://github.com/nicoputten/purrrshelf/commit/c3ef70066055e3a5d0308b1e9e9b1de31d86af0a))
* **broker:** search the indexer only when a book is added (BRK-05) ([4fb9013](https://github.com/nicoputten/purrrshelf/commit/4fb90133ea349946d500cd53ef70247b4a2892c3))
* **broker:** send library books to either reader's Kobo (APP-06) ([89873ce](https://github.com/nicoputten/purrrshelf/commit/89873ce5f61d600dbf3cdf0de918cc6868e85abc))
* **broker:** serve and cache book covers (BRK-07) ([32c587c](https://github.com/nicoputten/purrrshelf/commit/32c587cf167113c6b57b01e2fa9a5dca7c22b779))
* **broker:** track the indexer budget per rolling hour (BRK-04) ([01736d2](https://github.com/nicoputten/purrrshelf/commit/01736d238570aa8df715628ae049a1f904c6860b))
* browse my, my partner's and all books (APP-07) ([4af984f](https://github.com/nicoputten/purrrshelf/commit/4af984fefa221c5603d1ec49c5f3b016b30d79f1))
* **ops:** monorepo, CI, secret scanning and broker image (OPS-01) ([d4d10c3](https://github.com/nicoputten/purrrshelf/commit/d4d10c3ea212d7a717844194eb15ea157a35fb92))
* show my Kobo reading progress on the book page (APP-08) ([ef12daa](https://github.com/nicoputten/purrrshelf/commit/ef12daabcf97c0600c022fff1c6e5dd9fd9017f4))
* similar books on the book page (APP-09) ([d93d248](https://github.com/nicoputten/purrrshelf/commit/d93d248b75b977c33f753235af27789be11670ca))


### Bug Fixes

* **broker:** read CWA's WAL databases reliably through read-only mounts ([21a8b42](https://github.com/nicoputten/purrrshelf/commit/21a8b4243dba507fb946af8b58589b2df843a322))
