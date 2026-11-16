# 0046. A one-word title needs the author in the release name

Status: accepted
Date: 2026-11-16

## Context

Release scoring (ADR 0006) and the search judge check that a release name
holds the words of the book's title, after dropping the subtitle
(`cleanTitle`). A missing author only costs 10 points. For a title like
"Atlas: The Story of Pa Salt" only "Atlas" is checked, so any release with
"Atlas" in its name matched 100% and scored well above the accept threshold.
A reader got another book called "Atlas …" on their Kobo.

We considered always showing a "pick a release" screen after each search.
That makes every add a three-tap job and asks the reader to read raw usenet
names, while the broker can tell these cases apart itself. The pick screen
already exists for requests where nothing clears the bar.

## Decision

- `search/match.ts` holds the shared matching rules for scoring and the judge.
- A release is only taken as this book when it names one of the authors'
  surnames, or the title has at least two telling words (filler words like
  "the", "of", "de", "het" don't count), or the release also names the
  subtitle and title plus subtitle have at least two telling words.
- Otherwise it is rejected as `title_mismatch` ("another book"), both by the
  search judge (so the search goes on) and by scoring (so it is never
  grabbed). The API doesn't change.
- Titles of two or more telling words and works without authors keep the old
  rule.

## Consequences

- Short titles no longer grab whichever book shares that word.
- A correct release that names neither the author nor the subtitle of a
  one-word title is rejected; if no other release fits, the request stops at
  "choose a release" and the reader can still pick it by hand.
- A different book with the same multi-word title and no author in its
  release name can still slip through; this was not seen yet.
- Nothing here calls an indexer.
