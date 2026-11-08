# OPS-02 Expose the broker through Nginx Proxy Manager

Status: done
Milestone: 8
Depends on: BRK-01

## Story

As a reader, I want to use the app outside the house,
so that I can add a book wherever I hear about it.

## Acceptance criteria

- [x] A proxy host for the broker only, HTTPS with HSTS
      ([deploy/reverse-proxy.md](../../deploy/reverse-proxy.md), checked by
      `deploy/check-proxy.sh`)
- [x] CWA, SABnzbd and the indexers stay internal (no proxy host, no router
      forward; the check script confirms their ports are closed)
- [x] Host name is configured on the server, never in the repo (NPM and the
      app's onboarding screen only)

## Design

No canvas board (no UI).

## Notes / decisions

- Open question answered: the CWA Kobo sync endpoint stays internal, so Kobos
  sync on the home Wi-Fi, as [ADR 0011](../decisions/0011-remote-access-via-proxy.md)
  says. Exposing it later needs its own ADR.
- The broker now trusts `X-Forwarded-For` only from the proxy, so the login
  rate limit cannot be dodged from the internet
  ([ADR 0018](../decisions/0018-trust-only-the-proxy.md), `TRUST_PROXY`).
- Done ahead of milestone 8, in parallel with milestone 2.
