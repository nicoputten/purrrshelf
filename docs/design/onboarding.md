# Onboarding and login

Not on the canvas yet; this is the interim spec built for APP-01 from the
design choices. It should be added to the canvas as a new board and this file
updated to match.

## Server step

- Cat logo and "Purrshelf", heading "Where does your shelf live?".
- One URL field (56 high, accent border on focus), no default value and no
  example host other than the placeholder `https://…`.
- **Connect** (primary, 56 high). The app calls `GET /api/v1/health`; while
  waiting the button shows "Checking…".
- Errors: invalid URL, server not reachable, "this is not a Purrshelf server".

## Login step

- Heading "Welcome back", the server address shown small with "Change".
- Username and password fields, **Log in** (primary).
- Errors are translated from the broker's error codes (wrong username or
  password, too many attempts / locked, server unreachable).

## Settings (first pass)

- Language: Follow phone / English / Nederlands.
- Theme: Follow phone / Dark / Light.
- Account: who is logged in, server address, Log out.
