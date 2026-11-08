# OPS-02 Expose the broker through Nginx Proxy Manager

Status: todo
Milestone: 8
Depends on: BRK-01

## Story

As a reader, I want to use the app outside the house,
so that I can add a book wherever I hear about it.

## Acceptance criteria

- [ ] A proxy host for the broker only, HTTPS with HSTS
- [ ] CWA, SABnzbd and the indexers stay internal
- [ ] Host name is configured on the server, never in the repo

## Design

No canvas board (no UI).

## Notes / decisions

Open question: should the CWA Kobo sync endpoint be reachable from outside too? See [ADR 0011](../decisions/0011-remote-access-via-proxy.md).
