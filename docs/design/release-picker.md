# Pick another release

Canvas board: 5 · Pick another release. Stories: APP-05.

- Back button, "Pick a release", "<title> · 5 results".
- Success banner with paw: "Free to browse: these came from the search we
  already did."
- Best match card with accent border: "Best match · fetching", age, release
  name, "EPUB · 1.4 MB · English · title and author match".
- Other cards: label (Good / Language differs), age, name, one-line
  explanation, **Use this one** (accent for good, outlined otherwise).
- "2 left out" card explaining why (PDF, oversized) with "Show them anyway".

Built (APP-05):

- The header reads "<title> · N results". The banner is in success colours.
- Labels: "Best match · fetching" (the release being downloaded, accent
  border), "Good" (score at or above the auto-pick bar), "Weaker match", and
  "Language differs" for a release left out for its language.
- Each card shows its age ("3 years ago"), name and "EPUB · 1.4 MB · English ·
  title and author match", or why it was left out.
- "N left out" lists the reasons; "Show them anyway" shows those cards too,
  and "Hide them" hides them again. A release that failed before can't be
  picked.
- Use this one goes back to Requests, which shows the new pick straight away.

## Search it yourself and Pick the right one (APP-18)

Canvas boards: 16 · Search it yourself, 16b · Pick from your own search,
16d · Where the advanced paths live. Broker: BRK-18,
[ADR 0048](../decisions/0048-search-it-yourself-and-wrong-book.md).

- Under the list (also when it is empty): "Not in this list?", "Search with
  your own words. Uses 1 search." and an outlined **Search it myself**.
- **Search it yourself** is a page of its own: back, "Search it yourself",
  "<title> · <author>".
  - WHAT WE TRIED: the last four searches of the request, "“<words>” ·
    <indexer>" with "nothing", "N results" or "no answer". Free (broker
    records only).
  - Search words: a text field, prefilled with the first suggestion not tried
    yet; up to three "Try" chips: the whole title, the title with the last
    telling words of the subtitle, the author's surname with the title, the
    title alone. A tip line says release names often leave out the author.
  - Look on: one card per indexer with a search budget, "N of M left today";
    the one with the most searches left is picked first.
  - Cost box with paw: "Uses **1 search** on <indexer>. Nothing is downloaded
    until you pick a book."
  - **Sniff with these words** (ears-up). The paw-print loader shows
    "Sniffing with your words…". No results: the napping cat, "Nothing for
    those words" and a tip; the words stay. With no searches left on the
    chosen indexer the button is off and reads "No searches left on <indexer>
    until <time>".
- Results open the picker as **Pick the right one**: "“<words>” on <indexer>
  · N results", a ginger (mine colours) banner "Your words, your pick. Check
  the name before you fetch: we only warn, we don't stop you."
  - Releases the scorer calls another book are shown in the list with the
    label "Another book?" and **Fetch anyway**; other left-out ones stay
    grouped. Good ones read **Fetch this one**.
  - At the bottom a text button **Other words** goes back to Search it
    yourself.
- Not built from board 16: "See those 100 again · free" (the broker only keeps
  releases from searches that found something).
