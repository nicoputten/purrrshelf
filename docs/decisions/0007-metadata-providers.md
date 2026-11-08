# 0007. Metadata: Hardcover first, plus Open Library and Google Books

Status: accepted
Date: 2026-11-08

## Context

Search needs good titles, series and covers in Dutch and English. Hardcover has the best data but its API is still changing.

## Decision

Query Hardcover first, then Open Library and Google Books. Merge by ISBN, then by normalised title + author, and cache results for 7 days.

## Consequences

- Two fallback providers keep search working if Hardcover changes.
- Hardcover tokens expire yearly; the broker warns before that.
- Provider keys are used server-side only.
