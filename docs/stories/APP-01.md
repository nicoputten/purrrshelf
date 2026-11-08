# APP-01 Connect the app to my server and log in

Status: done
Milestone: 1
Depends on: BRK-01

## Story

As a reader, I want to enter my server address once and log in,
so that the app works with my own broker and no address is ever built into the app.

## Acceptance criteria

- [x] First launch shows onboarding: a server URL field with no default, checked against `/api/v1/health` before continuing
- [x] Login with username and password; wrong password and lockout show translated errors
- [x] The refresh token and server URL are stored in secure storage; the access token stays in memory
- [x] An expired access token is refreshed once automatically; a failed refresh sends me back to login
- [x] UI in Dutch and English, following the phone language, with a manual override
- [x] Dark theme from one token set (the canvas colours); light theme from the same tokens
- [x] Logging out clears the stored tokens
- [x] Component tests cover onboarding, login and i18n; every key exists in both `en` and `nl`

## Design

Onboarding and login are not on the canvas yet. Interim spec: `docs/design/onboarding.md`; add it to the canvas as a new board.

## Notes / decisions

See [ADR 0001](../decisions/0001-expo-react-native.md), [ADR 0010](../decisions/0010-languages-and-dark-mode.md) and [ADR 0015](../decisions/0015-styling-with-tokens.md). Search, Library and Requests tabs are placeholders until APP-02, APP-07 and APP-05. End-to-end flow for Maestro: `apps/mobile/.maestro/onboarding-login.yaml`.
