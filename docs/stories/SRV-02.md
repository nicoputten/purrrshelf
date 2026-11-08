# SRV-02 Separate Kobo shelves and sync for both readers

Status: todo
Milestone: 0
Depends on: SRV-01

## Story

As a reader, I want my own CWA account with a Kobo shelf that syncs only to my Kobo,
so that books meant for one reader never land on the other's device.

## Acceptance criteria

- [ ] Two CWA users exist, each with download permission
- [ ] Each user has "Sync only books in selected shelves" on and a `Kobo` shelf set to sync
- [ ] Each Kobo's `api_endpoint` points at its own user's sync URL
- [ ] A book added by hand to one user's shelf appears on that Kobo only

## Design

No canvas board (no UI).

## Notes / decisions

Manual setup, no code. Steps: `deploy/truenas.md`. See [ADR 0008](../decisions/0008-two-users.md).
