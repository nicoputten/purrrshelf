# 0009. Library: one shared copy per book, ownership per user

Status: accepted
Date: 2026-11-08

## Context

Both readers may want the same book. Downloading it twice wastes budget and disk.

## Decision

Each book exists once in Calibre (`library_items`); ownership is a separate per-user record. A book either user already has is shared instantly with no download. When nobody owns a book any more it is deleted after a 7-day grace period, with undo.

## Consequences

- Removing a book from my library also removes it from my Kobo shelf.
- Deletion is driven by ownership, never by one user alone.
