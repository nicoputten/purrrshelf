# APP-01 Connect the app to my server and log in

Status: todo
Milestone: 1
Depends on: BRK-01

## Story

As a reader, I want to enter my server address once and log in,
so that the app works with my own broker and no address is ever built into the app.

## Acceptance criteria

- [ ] First launch shows onboarding: a server URL field with no default, checked against `/api/v1/health` before continuing
- [ ] Login with username and password; wrong password and lockout show translated errors
- [ ] The refresh token and server URL are stored in secure storage; the access token stays in memory
- [ ] An expired access token is refreshed once automatically; a failed refresh sends me back to login
- [ ] UI in Dutch and English, following the phone language, with a manual override
- [ ] Dark theme from one token set (the canvas colours); light theme from the same tokens
- [ ] Logging out clears the stored tokens
- [ ] Component tests cover onboarding, login and i18n; every key exists in both `en` and `nl`

## Design

Onboarding and login are not on the canvas yet. Interim spec: `docs/design/onboarding.md`; add it to the canvas as a new board.

## Notes / decisions

See [ADR 0001](../decisions/0001-expo-react-native.md) and [ADR 0010](../decisions/0010-languages-and-dark-mode.md).
