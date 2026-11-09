# Settings

Tab: Settings (sliders icon). Sections from top to bottom: Language, Theme,
App, Account. (The Library section with the one-time Calibre import is gone,
ADR 0036.)

## App (APP-10)

- Label **App**, then "Installed version: 1.2.0" in muted text.
- When the broker has a newer version: a card (surface background, accent
  border, card radius) with "Version 1.3.0 is ready" in bold, up to eight lines
  of release notes in muted text (plain, cat-styled sections such as "New
  tricks" and "Fixed scratches", ADR 0033), a primary **Update** button and a muted hint:
  "The first time, Android asks you to allow installs from Purrshelf. Turn it on
  and go back."
- While downloading, the Update button is disabled and reads
  "Downloading… 42%"; then "Opening the installer…".
- "You have the newest version." after a check that found nothing.
- After a check that found nothing or failed, a muted "Checked at 23:40" line
  (local time), so a repeated tap visibly checked again.
- Errors (check failed, download failed, damaged download, installer failed)
  appear in danger colour above the check button, as an alert.
- **Install updates automatically** (APP-11): label, an On / Off segmented
  control (On by default) and a muted hint: "After the first update, Purrshelf
  downloads new versions and installs them when you leave the app. Reopen it to
  use the new version."
- With automatic updates on and Android willing to install without asking, the
  card reads "Downloaded. It installs by itself when you leave the app." and
  the button says **Update now**.
- An outline **Check for updates** button ends the section.
- The Settings tab shows a badge while an update is ready, and screen readers
  hear "Settings, app update ready".

The app checks quietly on launch and when it comes back to the front, at most
every 6 hours. Quiet checks never show an error.
