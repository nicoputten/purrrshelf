# BRK-01 Log in with my own account

Status: done
Milestone: 1
Depends on: OPS-01

## Story

As a reader, I want to log in to the broker with my own username and password,
so that only the two of us can use it and each of us sees our own library and Kobo.

## Acceptance criteria

- [x] Users are stored with argon2id password hashes
- [x] `POST /api/v1/auth/login` returns a 15-minute access token and a 30-day refresh token
- [x] `POST /api/v1/auth/refresh` rotates the refresh token; reusing an old one revokes the whole family
- [x] `POST /api/v1/auth/logout` revokes the refresh token
- [x] `GET /api/v1/me` returns the current user and locale; every endpoint except login, refresh and health needs a bearer token
- [x] Repeated failed logins are rate limited and lock the account for a while
- [x] Errors use `{ code, message, details? }` with stable codes
- [x] Request and response shapes live in `packages/contract` as Zod schemas, with a generated OpenAPI document
- [x] `GET /api/v1/health` reports liveness and dependency checks (database now; CWA, SABnzbd, indexers and metadata as they land)
- [x] A CLI command creates or resets a user, so no password is ever in the repo

## Design

No canvas board (no UI).

## Notes / decisions

See [ADR 0002](../decisions/0002-typescript-broker.md) and [ADR 0008](../decisions/0008-two-users.md).
