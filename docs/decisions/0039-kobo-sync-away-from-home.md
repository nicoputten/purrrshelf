# 0039. Kobo sync away from home: only CWA's /kobo/ path, on its own proxy host

Status: accepted
Date: 2026-11-09

## Context

[ADR 0011](0011-remote-access-via-proxy.md) exposes only the broker, so the app
works anywhere but a Kobo only syncs on the home Wi-Fi: its `api_endpoint`
points at CWA's LAN address. Readers want a book they add on the road to land
on their Kobo the next time it is on any Wi-Fi (a hotel, a phone hotspot).

The Kobo cannot run a VPN client, and Android does not send hotspot traffic
through the phone's VPN, so Tailscale or WireGuard does not help the Kobo. The
Kobo can only reach CWA if CWA's Kobo sync endpoint is public.

CWA's Kobo API lives under `/kobo/<token>/…`. The token is a long random
secret per CWA user and is the only credential the Kobo sends. CWA builds the
download and cover URLs it hands the Kobo from the request: behind a proxy
that sends `X-Forwarded-Proto` (NPM does), it uses the request's host and
scheme, so the URLs come out as `https://<kobo-host>/kobo/<token>/…`. Without
those headers (a Kobo on the LAN talking to CWA directly) it uses the LAN host
and CWA's "external port" setting, as before.

## Decision

- A second Nginx Proxy Manager host, `<kobo-host>`, with HTTPS (Let's Encrypt)
  and HSTS, forwards **only `/kobo/`** to CWA. Every other path answers 404 at
  the proxy, so CWA's web UI and login stay off the internet.
- Each Kobo's `api_endpoint` becomes `https://<kobo-host>/kobo/<token>`, at
  home too (the router's NAT loopback brings it back in).
- The broker keeps talking to CWA on the LAN (`CWA_BASE_URL` is unchanged) and
  the app keeps talking only to the broker. No code changes.
- CWA's "proxy unknown requests to Kobo Store" stays on, so the Kobo's reading
  services and store calls go to Kobo, not to the public host.

## Consequences

- Anyone who learns a reader's token can read the books on that reader's
  synced shelves and change that shelf. The token is only stored on the Kobo
  and in CWA. If a Kobo is lost, the reader regenerates the token in CWA and
  the broker picks up the new one from CWA's database (ADR 0021).
- CWA's code now parses requests from the internet on `/kobo/`. NPM's "Block
  Common Exploits" stays on, and CWA updates matter more.
- `<kobo-host>` is server configuration, never in the repo, like the broker
  host.
- Setup and the check script: `deploy/reverse-proxy.md` section 6 and
  `deploy/check-kobo-proxy.sh`.
