#!/usr/bin/env sh
# Checks the public broker proxy host (OPS-02, deploy/reverse-proxy.md).
# Run it from outside your own network: deploy/check-proxy.sh <broker-host>
# Needs curl. Exits non-zero if any check fails.
set -u

host="${1:-}"
if [ -z "$host" ]; then
  echo "usage: $0 <broker-host> [port ...]" >&2
  echo "  extra ports to check are closed (default: 8080 8083 8085 8090)" >&2
  exit 2
fi
shift
ports="${*:-8080 8083 8085 8090}"
failed=0

ok() { printf '  ok    %s\n' "$1"; }
bad() {
  printf '  FAIL  %s\n' "$1"
  failed=1
}

echo "Checking $host"

# 1. Plain HTTP redirects to HTTPS.
location=$(curl -sS -o /dev/null -m 10 -w '%{redirect_url}' "http://$host/api/v1/health" 2>/dev/null)
case "$location" in
  https://*) ok "HTTP redirects to HTTPS" ;;
  *) bad "HTTP does not redirect to HTTPS (got '${location:-no redirect}')" ;;
esac

# 2. Health answers over HTTPS with a valid certificate.
headers=$(mktemp)
body=$(curl -sS -m 10 -D "$headers" "https://$host/api/v1/health" 2>&1)
status=$(head -n 1 "$headers" | awk '{print $2}')
if [ "$status" = "200" ] && printf '%s' "$body" | grep -q '"service":"purrshelf-broker"'; then
  ok "broker answers on https://$host/api/v1/health"
else
  bad "no broker health answer over HTTPS (status '${status:-none}': $body)"
fi

# 3. HSTS with max-age of at least a year.
hsts=$(grep -i '^strict-transport-security:' "$headers" | tr -d '\r')
rm -f "$headers"
max_age=$(printf '%s' "$hsts" | sed -n 's/.*max-age=\([0-9][0-9]*\).*/\1/p')
if [ -n "$max_age" ] && [ "$max_age" -ge 31536000 ]; then
  ok "HSTS: ${hsts#*: }"
else
  bad "HSTS header missing or shorter than a year ('${hsts:-none}')"
fi

# 4. Internal ports are closed on the public address.
for port in $ports; do
  curl -s -o /dev/null -m 5 "http://$host:$port/" 2>/dev/null
  case $? in
    # 7: connection refused, 28: timed out (dropped by the router).
    7 | 28) ok "port $port is closed" ;;
    *) bad "port $port answers from outside; forward only 80/443, to the proxy" ;;
  esac
done

if [ "$failed" -ne 0 ]; then
  echo "Some checks failed."
  exit 1
fi
echo "All checks passed."
