# 0012. Notifications: none in v1

Status: accepted
Date: 2026-11-08

## Context

Push notifications need extra services (FCM) and accounts, and the app already shows live progress while it is open.

## Decision

No notifications in v1. Live request progress is shown over server-sent events while the app is open.

## Consequences

- Simpler setup and no Firebase project.
- Revisit after v1 if waiting for downloads turns out to be annoying.
