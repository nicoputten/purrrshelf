# 0010. Languages: Dutch and English books, bilingual UI, dark mode

Status: accepted
Date: 2026-11-08

## Context

Both readers read in Dutch and English and use their phones in the evening.

## Decision

Books can be added in Dutch or English (chosen when adding, remembered). The UI is fully translated into Dutch and English with i18next, follows the phone language and can be overridden. Dark mode is the primary theme; colours come from one token set.

## Consequences

- Every user-facing string has an `en` and `nl` translation; a test fails on a missing key.
- API errors carry stable codes that the app translates.
