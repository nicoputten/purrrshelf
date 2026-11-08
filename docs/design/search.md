# Search (home)

Canvas board: 1 · Search (home). Stories: APP-02.

- Header: cat logo + "Purrshelf"; budget pill on the right ("21 / 25 left",
  paw icon) linking to Requests. Accessible label: "21 of 25 indexer searches
  left today".
- Heading: "What are we reading next?" (Fredoka 30).
- Search field with cat ears, search icon, 56 high, accent border.
- Language chips: Any language (selected) / English / Nederlands.
- Hint line: "3 books found · looking costs nothing, only **Add** uses a search".
- Result card: cover (56×84), title, author · series or language, badges.
  - Already in the library: the whole card opens Book detail; badges such as
    "On your Kobo" (success) and "Partner has it" (partner).
  - Not in the library: an accent **Add** button (64×44) opens the Add sheet.
- Bottom tab bar, Search active.

Built (APP-02):

- Partner badges name the other reader: "Reader Two has it" ("… heeft het").
  A book of mine that is not on my Kobo shows "Yours".
- Before typing, the hint line reads "Looking costs nothing, only **Add** uses
  a search". States: "Sniffing around…" while loading, "Couldn't sniff
  anything out" with a tip when empty, and the translated error with "Try
  again" when search is down.
- The budget pill only shows once the server has an indexer.
- An accent Add button (64×44) on cards not in the library opens the Add
  sheet (APP-03).

Daily budget (ADR 0025): the pill counts searches left in the last 24 hours,
so the label now ends in "left today" (nl "vandaag").

Motion (DES-02): while a search runs, three paw prints step in turn over
"Sniffing around…". No results shows the napping cat over "Couldn't sniff
anything out".
