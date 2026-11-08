# APP-10 Update the app from inside the app

Status: in review
Milestone: 9
Depends on: BRK-10

## Story

As a reader, I want the app to tell me about a new version and install it in a tap,
so that I never have to find and sideload an APK again.

## Acceptance criteria

- [x] On launch and when the app comes back to the front (at most every 6 hours), and from Settings, the app asks the broker for the latest version and compares its versionCode with its own
- [x] A newer version puts a badge on the Settings tab and shows an update card in Settings with the version and release notes
- [x] "Update" downloads the APK from the broker over HTTPS with progress, checks the SHA-256 and opens the Android installer; a bad hash deletes the file and shows a translated error
- [x] The update card explains that Android asks once to allow installs from Purrshelf (Android shows that prompt itself)
- [x] Settings shows the installed version
- [x] Strings in `en` and `nl`; tests cover the check, download, hash failure, failures and the Settings section

## Design

Settings "App" section and tab badge: [`docs/design/settings.md`](../design/settings.md).

## Notes / decisions

See [ADR 0031](../decisions/0031-in-app-updates.md). Needs `REQUEST_INSTALL_PACKAGES`
(in `app.json`). Uses `expo-file-system` (download with progress, content URI),
`expo-crypto` (SHA-256) and `expo-intent-launcher` (installer intent), wrapped in
`src/features/updates/native.ts` so tests replace the phone parts. A banner on
every screen was dropped in favour of the tab badge: it would cover content on
the search screen. Quiet checks never show an error; a check from Settings does.
