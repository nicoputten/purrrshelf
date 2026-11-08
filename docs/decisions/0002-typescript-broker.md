# 0002. Backend: a TypeScript broker in Docker

Status: accepted
Date: 2026-11-08

## Context

The app must never hold API keys or call the indexer directly. Something on the NAS has to own the budget, the keys and the integrations with SABnzbd and the library.

## Decision

One Node.js LTS service (the broker) in TypeScript strict: Fastify, Zod for validation and the shared contract, Drizzle ORM on SQLite (better-sqlite3), pino logging and a small persisted job runner (jobs table, no Redis). Shipped as a single non-root Docker image on GHCR.

## Consequences

- One process and one SQLite file on `/data` keep operations simple on TrueNAS.
- Modules sit behind interfaces so they can be tested with fakes and swapped.
- No horizontal scaling; not needed for two users.
