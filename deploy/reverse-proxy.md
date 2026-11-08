# Remote access through Nginx Proxy Manager (OPS-02)

The app has to work outside the house. Only the **broker** is reachable from
the internet, through a proxy host in the Nginx Proxy Manager (NPM) that
already runs on the NAS ([ADR 0011](../docs/decisions/0011-remote-access-via-proxy.md)).
CWA, SABnzbd and the indexers stay on the LAN.

```
phone ──HTTPS──▶ router :443 ──▶ NPM ──HTTP (LAN)──▶ broker :8080
                                                     │
                                  CWA, SABnzbd ◀─────┘ (LAN only)
```

The public host name lives in NPM and in the app's onboarding screen only.
Below, `<broker-host>` is your own name (for example a subdomain of a domain
you own) and `<nas-lan-address>` is the NAS on your LAN. Neither goes in this
repo.

## 1. DNS and router

1. Point `<broker-host>` at your public address (an A/AAAA record, or a CNAME
   to your dynamic-DNS name).
2. On the router, forward **TCP 80 and 443 to NPM only**. Port 80 is needed for
   the Let's Encrypt HTTP challenge and the redirect to HTTPS. Forward nothing
   else: not 8080 (broker), 8083 (CWA) or SABnzbd's port.

## 2. Proxy host

In NPM, **Hosts → Proxy Hosts → Add Proxy Host**.

**Details**

| Field                 | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Domain Names          | `<broker-host>`                                                         |
| Scheme                | `http`                                                                  |
| Forward Hostname / IP | `<nas-lan-address>` (or the broker's container name, if shared network) |
| Forward Port          | `8080`                                                                  |
| Cache Assets          | off (every answer is per user)                                          |
| Block Common Exploits | on                                                                      |
| Websockets Support    | off (the broker has no websockets)                                      |
| Access List           | Publicly Accessible (the broker does its own login)                     |

**SSL**

| Field           | Value                                          |
| --------------- | ---------------------------------------------- |
| SSL Certificate | Request a new SSL Certificate (Let's Encrypt)  |
| Force SSL       | on (HTTP answers with a redirect to HTTPS)     |
| HTTP/2 Support  | on                                             |
| HSTS Enabled    | **on**                                         |
| HSTS Subdomains | only if every subdomain of the domain is HTTPS |

NPM's HSTS header is `max-age=63072000` (two years). Once a phone has seen it,
it refuses plain HTTP to `<broker-host>`, so get the certificate working first.

**Advanced** (optional). The app sends small JSON bodies only; this keeps
anything bigger out:

```nginx
client_max_body_size 1m;
```

Save. NPM sends `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Real-IP` by
default; leave them.

## 3. The broker behind the proxy

The broker reads the client address from `X-Forwarded-For`, but only when the
request comes from a trusted proxy (`TRUST_PROXY`,
[ADR 0018](../docs/decisions/0018-trust-only-the-proxy.md)). The default,
`loopback,linklocal,uniquelocal`, trusts private networks, which covers NPM on
the same NAS. That keeps the login rate limit per phone instead of one shared
bucket for everyone. To pin it down further, set `TRUST_PROXY` in the broker's
`.env` to NPM's address or Docker subnet.

Keep the broker's published port LAN-only (the router does not forward it).

## 4. Nothing else is exposed

- No NPM proxy host for CWA, SABnzbd or an indexer.
- No router port forward except 80/443 to NPM.
- **Kobo sync stays on the home Wi-Fi.** Each Kobo's `api_endpoint` points at
  CWA's LAN address, so books sync when the reader is at home. Exposing CWA's
  Kobo endpoint would need its own ADR (it also exposes the CWA login).

## 5. Check it

From a phone on **mobile data** (or any machine outside your network; from
inside, the router may loop back and hide mistakes):

```sh
deploy/check-proxy.sh <broker-host>
```

It checks that HTTP redirects to HTTPS, that `/api/v1/health` answers through
HTTPS with a valid certificate and an HSTS header of at least a year, and that
the broker, CWA and SABnzbd ports are closed on the public address. Then open
the app, enter `https://<broker-host>` on the onboarding screen and log in.
