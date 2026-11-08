# Settings

Tab: Settings (sliders icon). Sections from top to bottom: Language, Theme,
Library, App, Account.

## App (APP-10)

- Label **App**, then "Installed version: 1.2.0" in muted text.
- When the broker has a newer version: a card (surface background, accent
  border, card radius) with "Version 1.3.0 is ready" in bold, up to eight lines
  of release notes in muted text, a primary **Update** button and a muted hint:
  "The first time, Android asks you to allow installs from Purrshelf. Turn it on
  and go back."
- While downloading, the Update button is disabled and reads
  "Downloading… 42%"; then "Opening the installer…".
- "You have the newest version." after a check that found nothing.
- Errors (check failed, download failed, damaged download, installer failed)
  appear in danger colour above the check button, as an alert.
- An outline **Check for updates** button ends the section.
- The Settings tab shows a badge while an update is ready, and screen readers
  hear "Settings, app update ready".

The app checks quietly on launch and when it comes back to the front, at most
every 6 hours. Quiet checks never show an error.
