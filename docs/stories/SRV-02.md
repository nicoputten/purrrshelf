# SRV-02 Separate Kobo shelves and sync for both readers

Status: done
Milestone: 0
Depends on: SRV-01

## Story

As a reader, I want my own CWA account with a Kobo shelf that syncs only to my Kobo,
so that books meant for one reader never land on the other's device.

## Acceptance criteria

- [x] Each reader is a normal (non-admin) CWA user with download permission
- [x] Each user has "Sync only books in selected shelves with Kobo" on
- [x] Each user owns one private shelf named `Kobo` with "Sync this shelf with Kobo device" on
- [x] Each Kobo's `api_endpoint` points at its own user's sync URL
- [x] A book added by hand to one user's shelf appears on that Kobo only

## Design

No canvas board (no UI).

## Notes / decisions

Done by hand on 2026-11-08. Shelf IDs differ per user and are looked up at runtime. See [ADR 0008](../decisions/0008-two-users.md) and [ADR 0017](../decisions/0017-cwa-setup-contract.md).
