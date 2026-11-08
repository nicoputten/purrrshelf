# 0024. Live request updates over a server-sent event stream

Status: accepted
Date: 2026-11-08

## Context

ADR 0012 says live request progress is shown over server-sent events while
the app is open (no push notifications in v1). The app runs on React Native,
where the browser `EventSource` is missing and can't send the bearer token
anyway. The broker is a single process, and requests change in three places:
the request service, the release pipeline and delivery.

## Decision

- `GET /api/v1/requests/events` is a `text/event-stream` behind the normal
  bearer token. It sends `: connected` first, then one `event: request`, with
  the full `BookRequest` as data, every time one of the user's requests is
  written. It sends `x-accel-buffering: no` so Nginx Proxy Manager passes
  events through right away.
- Every writer of the `requests` table passes the new row to an in-process
  `RequestEvents` emitter. There is no polling or timer in the broker: the
  budget-safety rule (only the job runner uses timers) stays as it is.
- The app opens the stream with `expo/fetch`, which can read a response
  body as it streams and send headers. It updates the cached request list per
  event. After the connection drops it reconnects after 1, 2 and 5 s, then
  every 15 s, and refetches the list once it is back. On a 401 it refreshes
  the access token and reconnects. While the stream is down, Requests polls
  every 3 s until every request has settled (the APP-03 behaviour).
- The broker closes open streams on shutdown (`forceCloseConnections`).

## Consequences

- Events reach only the broker process that wrote them. That's fine for one
  self-hosted broker; more replicas would need a shared bus.
- No heartbeat is sent. A proxy that drops idle connections just causes a
  reconnect, which costs nothing.
- Picking another release, Try again and Cancel answer with the new request
  as well, so the app does not have to wait for the event.
