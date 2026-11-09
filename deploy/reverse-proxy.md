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

- No NPM proxy host for SABnzbd or an indexer, and none for CWA except the
  `/kobo/`-only host of section 6.
- No router port forward except 80/443 to NPM.
- CWA's web UI and login stay internal. Only its Kobo sync path `/kobo/` may
  be public, on its own host (section 6,
  [ADR 0039](../docs/decisions/0039-kobo-sync-away-from-home.md)).

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

## 6. Kobo sync away from home (optional)

Without this, a Kobo only syncs on the home Wi-Fi. With it, a Kobo syncs on
any Wi-Fi (a hotel, a phone hotspot)
([ADR 0039](../docs/decisions/0039-kobo-sync-away-from-home.md)). A VPN does
not help here: a Kobo cannot run one, and Android does not send hotspot
traffic through the phone's VPN.

`<kobo-host>` is a second name (for example another subdomain), pointed at
your public address like `<broker-host>`. `<cwa-port>` is the port CWA
publishes on the NAS.

**Proxy host.** In NPM, **Add Proxy Host**:

| Tab      | Field                 | Value                                       |
| -------- | --------------------- | ------------------------------------------- |
| Details  | Domain Names          | `<kobo-host>`                               |
| Details  | Scheme / Forward      | `http`, `<nas-lan-address>`, `<cwa-port>`   |
| Details  | Cache Assets          | off                                         |
| Details  | Block Common Exploits | on                                          |
| Details  | Websockets Support    | off                                         |
| Details  | Access List           | Publicly Accessible (the token is the auth) |
| SSL      | Certificate           | new Let's Encrypt certificate               |
| SSL      | Force SSL, HTTP/2     | on                                          |
| SSL      | HSTS Enabled          | on                                          |
| Advanced | Custom configuration  | the block below                             |

```nginx
# Only CWA's Kobo sync API is public; the web UI and login are not.
location /kobo/ {
    include conf.d/include/proxy.conf;
}
location / {
    return 404;
}
```

Because the block has its own `location /`, NPM leaves out its default one.
`proxy.conf` sends `Host` and `X-Forwarded-Proto`, which makes CWA hand the
Kobo `https://<kobo-host>/kobo/<token>/…` download and cover links. Kobo sync
needs no larger `client_max_body_size` than NPM's default.

**CWA.** Leave Kobo sync and "proxy unknown requests to Kobo Store" on, and
leave the external port as it is (CWA only uses it for Kobos that still talk
to it on the LAN).

**Each Kobo.** Connect it by USB, open `.kobo/Kobo/Kobo eReader.conf` and, in
`[OneStoreServices]`, change the host part of `api_endpoint`:

```ini
api_endpoint=https://<kobo-host>/kobo/<that reader's token>
```

Keep the token that is already there. Eject, then sync once at home and once
on a phone hotspot. If only the home sync fails, the router does not loop
traffic for its own public address back in (NAT loopback, sometimes called
hairpinning); turn that on in the router.

**Check it** from outside your network:

```sh
deploy/check-kobo-proxy.sh <kobo-host>
```

It checks the HTTPS redirect, HSTS, the 404 for CWA's web UI and the 401 for a
wrong token. To also check that CWA hands out HTTPS links on `<kobo-host>`,
give it one reader's token through the environment, so the token stays out of
your shell history:

```sh
read -r KOBO_TOKEN && export KOBO_TOKEN   # paste the token, press Enter
deploy/check-kobo-proxy.sh <kobo-host>
unset KOBO_TOKEN
```

**If a Kobo is lost**, regenerate that reader's Kobo token in CWA (profile
page, Kobo sync) and put the new one in the reader's next Kobo. The broker
reads the token from CWA each time, so it needs nothing.
