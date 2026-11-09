# OPS-04 Sync my Kobo away from home

Status: done
Milestone: 10
Depends on: OPS-02

## Story

As a reader, I want my Kobo to sync on any Wi-Fi,
so that a book I add on holiday reaches my Kobo there too.

## Acceptance criteria

- [x] A proxy host that forwards only CWA's `/kobo/` path, HTTPS with HSTS;
      every other path answers 404
      ([deploy/reverse-proxy.md](../../deploy/reverse-proxy.md) section 6)
- [x] A check script confirms the redirect, the 404 for CWA's web UI, the 401
      for a wrong token and, given a token, that CWA hands the Kobo HTTPS URLs
      on the public host (`deploy/check-kobo-proxy.sh`)
- [x] The broker, the app and `CWA_BASE_URL` stay as they are; the host name
      stays out of the repo

## Design

No canvas board (no UI).

## Notes / decisions

- [ADR 0039](../decisions/0039-kobo-sync-away-from-home.md): why only `/kobo/`
  and why not a VPN (a Kobo cannot run one).
- OPS-02's note that Kobo sync stays on the home Wi-Fi is replaced by this
  story.
