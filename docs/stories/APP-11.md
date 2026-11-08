# APP-11 Install updates without the Install screen

Status: todo
Milestone: 9
Depends on: APP-10

## Story

As a reader, I want updates to install themselves when I open the app,
so that both phones stay on the newest version without me thinking about it.

## Acceptance criteria

- [ ] A local Expo native module installs the APK through a `PackageInstaller` session with `USER_ACTION_NOT_REQUIRED` on Android 12+ and claims update ownership on Android 14+
- [ ] Once the app installed itself the first time (APP-10), later updates install without the system Install screen and the app restarts on the new version
- [ ] If Android still asks for confirmation (first install, older Android, ownership lost), the normal installer screen opens
- [ ] A setting "Install updates automatically" (on by default) lets the app update on launch without a tap
- [ ] Tested by hand on both phones: one update with the dialog, then one without it

## Design

Settings update section: `docs/design/settings.md`.

## Notes / decisions

See [ADR 0031](../decisions/0031-in-app-updates.md).
