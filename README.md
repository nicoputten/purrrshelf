# Purrshelf

"I heard about a book" → "it's on my Kobo", in two taps.

Purrshelf is an Android app plus a small self-hosted **broker**. You search for
a book by title, tap Add, and the broker finds it on your Newznab indexer
(within a strict hourly budget), downloads it with SABnzbd, imports it into
[Calibre-Web-Automated](https://github.com/crocodilestick/Calibre-Web-Automated)
and puts it on your Kobo's sync shelf.

Status: early development (milestone 1, foundations).

## Repository

| Path                | What                                          |
| ------------------- | --------------------------------------------- |
| `apps/broker`       | Fastify broker and its Docker image           |
| `apps/mobile`       | Expo app                                      |
| `packages/contract` | Zod API contract shared by app and broker     |
| `packages/config`   | shared TypeScript, ESLint and Prettier config |
| `deploy/`           | example compose file and server setup guide   |
| `docs/stories/`     | user stories and their status                 |
| `docs/design/`      | design choices and one file per screen        |
| `docs/decisions/`   | architecture decision records                 |

## Development

Requirements: Node 22+, pnpm 10 (`corepack enable`), Docker, and
[gitleaks](https://github.com/gitleaks/gitleaks#installing) for the pre-commit hook.

```sh
pnpm install
pnpm test
pnpm lint && pnpm typecheck && pnpm format:check
```

Configuration comes from environment variables; see `.env.example`. Never
commit real values. See `CLAUDE.md` for the project rules.

## Licence

MIT
