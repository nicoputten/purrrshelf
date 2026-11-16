# BRK-21 Keep deleting books after CWA's form token expires

Status: done
Milestone: 12
Depends on: BRK-03, BRK-08

## Story

As a reader, I want a book nobody owns to be deleted on time, even when the
broker has been running for days, so that a wrong book doesn't linger in the
library.

## Acceptance criteria

- [x] When CWA answers a POST with a bare 400 (a stale CSRF token), the broker logs in again for a fresh token and retries that POST once
- [x] A second 400 is passed on, so the caller still reports the refusal
- [x] GET requests are not retried on a 400
- [x] Tests first; the library module stays at 100% coverage

## Design

No screen change.

## Notes / decisions

Found when the cleanup job could not delete two wrong books ("CWA refused to
delete the book", status 400) and then deleted them right after a broker
restart. The broker keeps its CWA session for days to stay clear of CWA's
login rate limit, but CWA's CSRF tokens expire after an hour. Only a redirect
to the login page or a 401 used to trigger a new login.
