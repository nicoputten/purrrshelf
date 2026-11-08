# 0018. Trust X-Forwarded-For only from the proxy

Status: accepted
Date: 2026-11-08

## Context

Remote access goes through Nginx Proxy Manager (ADR 0011). Behind a proxy
every request comes from the proxy's address, so the broker has to read the
client's address from `X-Forwarded-For` to rate limit logins per client.

Milestone 1 set Fastify's `trustProxy: true`, which trusts every peer and takes
the left-most `X-Forwarded-For` entry. NPM appends the real client address to
whatever header the client sent, so anyone on the internet could put a new
address in front on every attempt and never hit the login rate limit.

## Decision

- The broker trusts `X-Forwarded-For` only from peers listed in `TRUST_PROXY`
  (IPs, CIDRs or the names `loopback`, `linklocal`, `uniquelocal`), and walks
  the header from the right, stopping at the first untrusted address.
- The default is `loopback,linklocal,uniquelocal`: NPM runs on the NAS, on a
  private or Docker network, while internet clients have public addresses.
- `TRUST_PROXY=none` trusts no proxy. `true` is refused at startup.

## Consequences

- An internet client cannot choose its own address; each phone gets its own
  login rate limit bucket.
- A device on the home LAN can still set its own `X-Forwarded-For` when it
  talks to the broker directly. The LAN is trusted; narrow `TRUST_PROXY` to
  NPM's address if that matters.
- If the proxy ever moves to a public address (for example a tunnel or VPS),
  `TRUST_PROXY` must name it, or every client shares the proxy's bucket.
