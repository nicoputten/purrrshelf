# 0011. Remote access: through the existing Nginx Proxy Manager

Status: accepted
Date: 2026-11-08

## Context

The app has to work outside the house, and there is already an Nginx Proxy Manager on the NAS.

## Decision

Expose only the broker through a new Nginx Proxy Manager host with HTTPS and HSTS. CWA, SABnzbd and the indexers stay internal.

## Consequences

- The public host name is server configuration, never in the repo.
- The app has no default server URL; the user enters it during onboarding.
