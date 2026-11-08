# OPS-01 Monorepo, CI, secret scanning, Docker image

Status: done
Milestone: 1
Depends on: none

## Story

As a developer, I want one monorepo with CI, secret scanning and a broker Docker image from day one,
so that every change is typed, tested and checked for leaked secrets before it reaches main.

## Acceptance criteria

- [x] pnpm workspaces + Turborepo (`apps/*`, `packages/*`); the broker and shared config land here, the contract and mobile app with BRK-01 and APP-01
- [x] Shared TypeScript (strict), ESLint and Prettier config in `packages/config`
- [x] gitleaks runs as a pre-commit hook (lefthook) and in CI over the full history; a hit fails the build
- [x] CI on every PR: frozen-lockfile install, gitleaks, format check, lint, typecheck, tests with coverage, dependency audit
- [x] The broker image builds in CI on every PR and is smoke-tested against `/api/v1/health`; on main it is pushed to GHCR
- [x] `CLAUDE.md`, `.env.example` (placeholders only), MIT licence
- [x] `docs/stories/`, `docs/design/` and `docs/decisions/` exist and are filled in
- [x] Renovate and release-please are configured; PR titles must be conventional commits

## Design

No canvas board (no UI).

## Notes / decisions

Branch protection on main must be turned on in the GitHub settings by the repo owner. See [ADR 0013](../decisions/0013-public-repo.md).
