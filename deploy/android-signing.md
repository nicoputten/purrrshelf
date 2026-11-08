# Android release signing

Release APKs are signed with a private release key (ADR 0031). Android only
installs an update that is signed with the same key as the installed app, so
this key is what lets the app update itself, and what stops anyone else from
building an "update". It is created once and kept in GitHub Actions secrets.
It never goes in the repo.

## 1. Create the key (once)

On your own computer, with a JDK installed (`keytool` comes with it):

```sh
keytool -genkeypair -v \
  -keystore purrshelf-release.keystore \
  -alias purrshelf \
  -keyalg RSA -keysize 4096 -validity 10000
```

Pick a strong store password and use the same one for the key when asked. The
name and organisation questions can stay generic (for example `Purrshelf`).

## 2. Store it in GitHub

In the repository, go to **Settings → Secrets and variables → Actions → New
repository secret** and add:

| Secret                      | Value                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | output of `base64 -w0 purrshelf-release.keystore` (macOS: `base64 -i purrshelf-release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | the store password                                                                                |
| `ANDROID_KEY_ALIAS`         | `purrshelf`                                                                                       |
| `ANDROID_KEY_PASSWORD`      | the key password (same as the store password)                                                     |

Release builds fail without these secrets. A test build started by hand
without them falls back to the public debug key and warns that the APK will
not install over a release build.

## 3. Back it up

Keep the keystore file and its password in your password manager or another
backup outside GitHub. GitHub secrets cannot be read back. If the key is lost,
the next APK has a new key, and every phone has to uninstall the app and set it
up again.

## 4. Switching a phone to the release key (once)

APKs built before this change were signed with the debug key, so the first
release-signed APK will not install over them. On each phone:

1. Uninstall Purrshelf.
2. Install the new APK from the GitHub release.
3. Enter the server URL and log in again.

Later updates install over the top.
