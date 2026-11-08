# 0008. Users: exactly two, each with their own login and Kobo

Status: accepted
Date: 2026-11-08

## Context

The app is for one household of two readers who each have a Kobo and want to see each other's books.

## Decision

The broker owns its accounts: argon2id password hashes, a 15-minute JWT access token and a rotating, revocable 30-day refresh token. Each user maps to their own CWA user and Kobo shelf. In practice there are two users, but the code has no hard limit.

## Consequences

- No sign-up flow; users are created with a broker CLI command.
- Login is rate limited and locks out after repeated failures.
- Either user can push to either Kobo.
