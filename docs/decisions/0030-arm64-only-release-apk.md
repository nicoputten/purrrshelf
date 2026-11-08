# 0030. Release APKs are arm64-only too

Status: accepted
Date: 2026-11-08

## Context

ADR 0028 made test APKs `arm64-v8a` only but kept all four ABIs for release
APKs, so a release APK would run on any device. In practice the app is
sideloaded onto a small, known set of phones, all of them `arm64-v8a`. A
four-ABI release build takes about 25 minutes and also misses the shared
build cache, while an arm64 build takes about 14 minutes cold and less with a
warm cache.

## Decision

- Every APK build, release builds included, makes `arm64-v8a` only by default.
- A build with all four ABIs stays a choice in the Actions tab, for a device
  that needs it (an x86 emulator or an old 32-bit phone).
- This amends the release-ABI part of ADR 0028; the rest of 0028 stands.

## Consequences

- Release APKs are as fast as test builds and share their caches.
- A release APK does not install on 32-bit ARM or x86 devices. If that is ever
  needed, run the workflow by hand with all ABIs, or revisit this ADR.
