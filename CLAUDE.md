# CLAUDE.md

Conventions for Claude Code (and humans) working in this repo.

## What this is

Purrshelf gets a book onto a Kobo in two taps. An Android app (Expo) talks only
to a small self-hosted TypeScript **broker**. The broker searches book metadata,
spends the scarce indexer budget, drives SABnzbd, imports into
Calibre-Web-Automated (CWA) and puts books on the right Kobo shelf.

## Layout

```
apps/mobile/        Expo app (Expo Router, TypeScript strict)
apps/broker/        Fastify service + Dockerfile
packages/contract/  Zod schemas shared by app and broker (single source of truth for the API)
packages/config/    shared tsconfig, ESLint, Prettier
deploy/             example compose file and server setup guide (placeholders only)
test/               shared fixtures (invented books, fake keys) and the integration stack
docs/stories/       one file per user story + README index
docs/design/        design-choices.md + one file per screen
docs/decisions/     numbered ADRs
```

## Before you build

1. Find the story in `docs/stories/` and read it, plus the ADRs and design
   files it links to.
2. A PR implements one story. Name the story ID in the PR title or body, tick
   its acceptance criteria and update its status (file and README index) in the
   same PR.
3. A new design or architecture choice gets an ADR in `docs/decisions/`.
   ADRs are superseded, never deleted or rewritten.
4. Screen changes update the matching file in `docs/design/`.

## Hard rules

- **Never commit secrets, domains, IP addresses or personal names.** That
  includes API keys, passwords, JWT secrets, Kobo tokens, real library
  contents and the SQLite database. Config comes from env (`.env.example` has
  placeholders only) or from the app's onboarding screen. gitleaks runs as a
  pre-commit hook and in CI; a hit fails the build.
- **Never add a code path that searches an indexer outside the budget
  module**, and never call an indexer on a timer except the
  `waiting_budget` job for a book a user just added. No RSS, no "search
  missing", no background retries.
- **Tests first** for release scoring, the indexer budget, the request status
  machine and library adapters. These need 100% coverage; the broker overall
  needs 80%+.
- Test fixtures use invented or public-domain books and fake keys.
- The app ships with **no default server URL**.
- Every user-facing string goes through i18n with both `en` and `nl`
  translations; a test fails if a key is missing in either.
- API errors use `{ code, message, details? }` with a stable `code` the app
  translates.

## Commands

```sh
pnpm install            # also installs the lefthook pre-commit hook (needs gitleaks on PATH)
pnpm test               # all unit/API tests
pnpm test:coverage      # with coverage thresholds
pnpm lint && pnpm typecheck && pnpm format:check
pnpm --filter @purrshelf/broker dev
pnpm --filter @purrshelf/mobile start
docker build -f apps/broker/Dockerfile .
```

## Style

- TypeScript strict everywhere; validate every external input with Zod.
- Conventional commits (`feat(broker): …`, `fix(mobile): …`, `docs: …`);
  release-please builds versions and changelogs from them.
- Broker modules sit behind interfaces so tests can use fakes and adapters
  can be swapped (CWA today, Grimmory later).
- Keep `media_type` on works and requests so audiobooks fit in later.
