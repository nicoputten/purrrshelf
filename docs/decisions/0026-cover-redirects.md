# 0026. Cover downloads follow checked redirects

Status: accepted
Date: 2026-11-08

## Context

ADR 0020 refused every redirect on a cover download. Open Library's cover
host answers each cover with a redirect to archive.org, so every Open Library
cover failed with "unexpected redirect" and the app showed placeholder cards.

## Decision

- Cover downloads follow up to three redirects, by hand (`redirect: manual`).
- Every hop gets the same check as the first URL: `https` only, no IP
  literals, no `localhost`, no single-label host. A relative location is
  resolved against the current URL.
- A redirect without a location, or more than three, fails the cover; the
  existing fallbacks (another provider, then the placeholder) take over.

## Consequences

- This amends the "no redirects" part of ADR 0020; the rest stands.
- A provider still can't point the broker at the home network by IP or bare
  hostname, at any hop.
