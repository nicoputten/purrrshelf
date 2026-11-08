# Purrshelf app

Expo (SDK 58, Expo Router) Android app. It talks only to a Purrshelf broker,
whose address the user enters on first launch; no server is built in.

```sh
pnpm --filter @purrshelf/contract build   # the app imports the shared contract
pnpm --filter @purrshelf/mobile start      # Metro; needs a development build for native modules
pnpm --filter @purrshelf/mobile android    # build and run on a device or emulator
pnpm --filter @purrshelf/mobile test
```

- `src/app/` routes (onboarding `server` → `login` → `(tabs)`), guarded by the session status.
- `src/session/` session (secure-stored refresh token, in-memory access token, refresh-once) and preferences.
- `src/i18n/` English and Dutch strings; a test fails if a key is missing in either.
- `src/theme/` design tokens from the canvas (`docs/design/design-choices.md`).
- `.maestro/` end-to-end flows; values such as the server URL come from env.
