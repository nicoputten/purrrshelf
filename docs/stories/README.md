# Stories

Every piece of work starts as a user story here. A PR names the story ID it
implements and updates the story's status (in its file and in this table) in
the same PR.

ID prefixes: **SRV** server setup, **BRK** broker, **APP** mobile app,
**DES** design, **OPS** CI, release and hosting.

Statuses: `todo`, `in progress`, `done`.

| ID                  | Story                                                          | Milestone | Status    |
| ------------------- | -------------------------------------------------------------- | --------- | --------- |
| [SRV-01](SRV-01.md) | Replace Calibre + Calibre-Web with CWA on the existing library | 0         | done      |
| [SRV-02](SRV-02.md) | Separate Kobo shelves and sync for both readers                | 0         | done      |
| [OPS-01](OPS-01.md) | Monorepo, CI, secret scanning, Docker image                    | 1         | done      |
| [BRK-01](BRK-01.md) | Log in with my own account                                     | 1         | done      |
| [APP-01](APP-01.md) | Connect the app to my server and log in                        | 1         | done      |
| [BRK-02](BRK-02.md) | Search book metadata from three providers                      | 2         | done      |
| [APP-02](APP-02.md) | Search for a book by title and see covers and badges           | 2         | done      |
| [APP-04](APP-04.md) | See book details, series and owners                            | 2         | done      |
| [BRK-03](BRK-03.md) | Read and change Kobo shelves through CWA                       | 3         | done      |
| [BRK-04](BRK-04.md) | Track the indexer budget per hour                              | 4         | done      |
| [BRK-05](BRK-05.md) | Search the indexer only when a book is added                   | 4         | done      |
| [BRK-06](BRK-06.md) | Pick, download and import the best release                     | 4         | done      |
| [APP-03](APP-03.md) | Add a book to my library                                       | 4         | done      |
| [APP-05](APP-05.md) | Follow a request and pick another release                      | 4         | done      |
| [BRK-07](BRK-07.md) | Serve and cache book covers                                    | 4         | done      |
| [APP-06](APP-06.md) | Send a book to my or my partner's Kobo                         | 5         | done      |
| [APP-07](APP-07.md) | Browse my, my partner's and all books                          | 5         | done      |
| [BRK-08](BRK-08.md) | Delete books nobody owns after 7 days                          | 5         | done      |
| [BRK-09](BRK-09.md) | Import the existing Calibre library                            | 6         | retired   |
| [APP-08](APP-08.md) | See reading progress from the Kobo                             | 7         | in review |
| [APP-09](APP-09.md) | See similar books on a book's page                             | 7         | done      |
| [OPS-02](OPS-02.md) | Expose the broker through Nginx Proxy Manager                  | 8         | done      |
| [DES-01](DES-01.md) | Recognise Purrshelf on my phone                                | 8         | done      |
| [DES-02](DES-02.md) | Little cat moments                                             | 8         | done      |
| [OPS-03](OPS-03.md) | Sign releases with our own key and real version numbers        | 9         | done      |
| [BRK-10](BRK-10.md) | Serve the latest app version                                   | 9         | done      |
| [APP-10](APP-10.md) | Update the app from inside the app                             | 9         | done      |
| [APP-11](APP-11.md) | Install updates without the Install screen                     | 9         | done      |
| [BRK-11](BRK-11.md) | Work out book suggestions for each reader                      | 10        | done      |
| [APP-12](APP-12.md) | See books picked for me on the Search tab                      | 10        | done      |
| [APP-13](APP-13.md) | Add a suggested book, instantly when my partner has it         | 10        | done      |
| [BRK-12](BRK-12.md) | Get genre top 10s for each reader                              | 11        | done      |
| [BRK-13](BRK-13.md) | Tell the app when a book will be hard to find                  | 11        | in review |
| [APP-16](APP-16.md) | See a warning before I spend searches on a hard book           | 11        | todo      |
| [OPS-04](OPS-04.md) | Sync my Kobo away from home                                    | 10        | done      |

## Template

Copy [`_template.md`](_template.md) to `<ID>.md`.
