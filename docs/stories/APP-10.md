# APP-10 Update the app from inside the app

Status: todo
Milestone: 9
Depends on: BRK-10

## Story

As a reader, I want the app to tell me about a new version and install it in a tap,
so that I never have to find and sideload an APK again.

## Acceptance criteria

- [ ] On launch (at most every few hours) and from Settings, the app asks the broker for the latest version and compares its versionCode with its own
- [ ] A newer version shows a banner and a Settings row with the version and release notes
- [ ] "Update" downloads the APK from the broker over HTTPS with progress, checks the SHA-256 and opens the Android installer; a bad hash deletes the file and shows a translated error
- [ ] The app asks for "install unknown apps" for itself once, with a short explanation
- [ ] Settings shows the installed version
- [ ] Strings in `en` and `nl`; component tests cover banner, download, hash failure and permission

## Design

Settings and home banner: new `docs/design/settings.md` (update section); add to the canvas.

## Notes / decisions

See [ADR 0031](../decisions/0031-in-app-updates.md). Needs `REQUEST_INSTALL_PACKAGES`.
