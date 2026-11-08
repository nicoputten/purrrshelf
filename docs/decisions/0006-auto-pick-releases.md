# 0006. Release picking: auto-pick by score, with "Pick another"

Status: accepted
Date: 2026-11-08

## Context

Users should not have to judge release names, but a wrong pick must be easy to fix without spending more budget.

## Decision

Score every result (format, language, title/author match, size, age and grabs, previous failures) and grab the best one above a threshold. Keep the full result list so "Pick another" and failure retries cost no extra API calls.

## Consequences

- Scoring needs 100% test coverage.
- Below the threshold the list is shown straight away.
- The picker explains why releases were left out.
