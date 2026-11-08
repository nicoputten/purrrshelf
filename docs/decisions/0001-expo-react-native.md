# 0001. Mobile app: React Native with Expo

Status: accepted
Date: 2026-11-08

## Context

We need an Android app for two people, phone only, with a possible Play Store release later. The app is a thin client: everything that spends indexer calls lives in the broker.

## Decision

Build the app with React Native and Expo (latest SDK, New Architecture on) and Expo Router, in TypeScript strict. Android first, phone only.

## Consequences

- Types are shared with the broker through `packages/contract`.
- EAS or a local Gradle build produces a sideloadable APK; a Play Store release stays possible.
- iOS, tablet layouts and a web client are out of scope for v1.
- Library versions are checked for Expo compatibility at build time (`expo install --check`).
