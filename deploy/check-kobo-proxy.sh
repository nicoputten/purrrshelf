#!/usr/bin/env sh
# Checks the public Kobo sync proxy host (OPS-04, deploy/reverse-proxy.md section 6).
# Run it from outside your own network: deploy/check-kobo-proxy.sh <kobo-host>
# Optional: export KOBO_TOKEN=<a reader's CWA Kobo token> to also check the
# links CWA hands the Kobo. Needs curl. Exits non-zero if any check fails.
set -u

host="${1:-}"
if [ -z "$host" ]; then
  echo "usage: $0 <kobo-host>   (optional: KOBO_TOKEN in the environment)" >&2
  exit 2
fi
failed=0

ok() { printf '  ok    %s\n' "$1"; }
bad() {
  printf '  FAIL  %s\n' "$1"
  failed=1
}
status_of() { curl -sS -o /dev/null -m 10 -w '%{http_code}' "$1" 2>/dev/null; }

echo "Checking $host"

# 1. Plain HTTP redirects to HTTPS.
location=$(curl -sS -o /dev/null -m 10 -w '%{redirect_url}' "http://$host/kobo/" 2>/dev/null)
case "$location" in
  https://*) ok "HTTP redirects to HTTPS" ;;
  *) bad "HTTP does not redirect to HTTPS (got '${location:-no redirect}')" ;;
esac

# 2. CWA's web UI and login are not public.
for path in / /login /admin/view; do
  status=$(status_of "https://$host$path")
  if [ "$status" = "404" ]; then
    ok "$path answers 404 (CWA web UI stays internal)"
  else
    bad "$path answers '$status'; only /kobo/ may reach CWA"
  fi
done

# 3. A wrong token is refused by CWA, with HSTS on the answer.
headers=$(mktemp)
status=$(curl -sS -o /dev/null -m 10 -D "$headers" -w '%{http_code}' \
  "https://$host/kobo/not-a-real-token/v1/library/sync" 2>/dev/null)
case "$status" in
  401 | 403) ok "a wrong Kobo token is refused ($status)" ;;
  *) bad "a wrong Kobo token got '${status:-no answer}' (expected 401 from CWA)" ;;
esac
hsts=$(grep -i '^strict-transport-security:' "$headers" | tr -d '\r')
rm -f "$headers"
if [ -n "$hsts" ]; then
  ok "HSTS: ${hsts#*: }"
else
  # NPM adds HSTS in its default location; a custom location may not.
  printf '  note  no HSTS header on /kobo/ (the Kobo does not need it)\n'
fi

# 4. With a real token, CWA hands the Kobo HTTPS links on this host.
if [ -n "${KOBO_TOKEN:-}" ]; then
  body=$(curl -sS -m 20 "https://$host/kobo/$KOBO_TOKEN/v1/initialization" 2>/dev/null)
  image_host=$(printf '%s' "$body" | sed -n 's/.*"image_host": *"\([^"]*\)".*/\1/p')
  if [ "$image_host" = "https://$host" ]; then
    ok "CWA hands out links on https://$host"
  else
    bad "CWA hands out links on '${image_host:-nothing}', expected https://$host (does the proxy send X-Forwarded-Proto?)"
  fi
else
  printf '  skip  link check (set KOBO_TOKEN to run it)\n'
fi

if [ "$failed" -ne 0 ]; then
  echo "Some checks failed."
  exit 1
fi
echo "All checks passed."
