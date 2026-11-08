# 0013. Repo: public, MIT licence, no secrets or personal data

Status: accepted
Date: 2026-11-08

## Context

The code should be shareable and usable by other self-hosters, but the household's setup must stay private.

## Decision

The repo is public under the MIT licence. No secrets, domain names, IP addresses, user names, Kobo tokens, library contents or databases are ever committed. Configuration comes from environment variables or the app's onboarding screen. gitleaks runs as a pre-commit hook and in CI.

## Consequences

- `.env.example` holds placeholders only; `.env` and `/data` are git-ignored.
- Test fixtures use invented or public-domain books and fake keys.
- Screenshots never show real library contents.
