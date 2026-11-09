# Changelog

## [1.2.1](https://github.com/nicoputten/purrrshelf/compare/broker-v1.2.0...broker-v1.2.1) (2026-11-09)


### Bug Fixes

* **broker:** budget pill shows the scarcest indexer, not a sum ([d3a115d](https://github.com/nicoputten/purrrshelf/commit/d3a115d4663f8958c4f7ff172a823530211cd5a7))
* **broker:** search the one field as title, author or both ([42453ae](https://github.com/nicoputten/purrrshelf/commit/42453ae67df3e101a7b256e3b17695b15cfbe8e4))

## [1.2.0](https://github.com/nicoputten/purrrshelf/compare/broker-v1.1.0...broker-v1.2.0) (2026-11-09)


### Features

* **broker:** remove the one-time Calibre library import ([5e93712](https://github.com/nicoputten/purrrshelf/commit/5e937127c9119e5ebbe3283d57ba43548d800032))
* **broker:** work out book suggestions for each reader (BRK-11) ([a3171a1](https://github.com/nicoputten/purrrshelf/commit/a3171a196fe1c86a5130d7a71eb23814150e4873))

## [1.1.0](https://github.com/nicoputten/purrrshelf/compare/broker-v1.0.0...broker-v1.1.0) (2026-11-09)


### Features

* **broker:** serve the latest app release for in-app updates ([4628180](https://github.com/nicoputten/purrrshelf/commit/462818023b150568b7957341b0dba26af7973f67))


### Bug Fixes

* **broker:** find a single-file download that SABnzbd reports by its file path ([217a3c6](https://github.com/nicoputten/purrrshelf/commit/217a3c63e3c81da7964f73a66a5b2c16e67cc770))
* **broker:** follow checked redirects for cover downloads ([35c68d6](https://github.com/nicoputten/purrrshelf/commit/35c68d6a2627a86214049c59f7ae4ecbbddf6961))
* **broker:** grab by the bare release id when the indexer sends a permalink guid ([c92fe2a](https://github.com/nicoputten/purrrshelf/commit/c92fe2a32eefb4d2dbef47a88e4cdc45d3c46ac0))
* **broker:** stop grabbing when an indexer refuses the same way twice ([13fb3d5](https://github.com/nicoputten/purrrshelf/commit/13fb3d51214447cd30f36a702a801cdcb7841f49))
* let a check for updates see a new release within minutes ([9f9b788](https://github.com/nicoputten/purrrshelf/commit/9f9b7886fd68f57dceb5d45cb88fbf5ccad595ec))
* show release notes as short cat-styled text in the updater ([f4b2c4c](https://github.com/nicoputten/purrrshelf/commit/f4b2c4c869009d56eb00d393a05a66da2d78e199))

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
