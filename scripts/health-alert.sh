#!/usr/bin/env bash
#
# Polls the live health endpoint and raises an alert somewhere a human looks —
# a GitHub issue on this repository — when the product is degraded.
#
# Deliberately not a "is the process up" check. It asks whether the one promise
# this product makes is still enforced: /api/health returns 503 if the exclusion
# constraint preventing double-booking has gone, even while the app serves
# traffic perfectly well.
#
#   ./scripts/health-alert.sh                  # uses the production URL below
#   HEALTH_URL=https://... ./scripts/health-alert.sh
#
# Exit 0 healthy · 1 degraded (alert raised) · 2 unreachable (alert raised)
set -uo pipefail

URL="${HEALTH_URL:-https://parkmitra-nu.vercel.app}/api/health"
REPO="${ALERT_REPO:-amrutha-kvb/parkmitra}"
LABEL="alert"

body="$(curl -s -m 20 -w '\n%{http_code}' "$URL" 2>/dev/null)"
code="$(printf '%s' "$body" | tail -1)"
payload="$(printf '%s' "$body" | sed '$d')"

raise() {
  local title="$1" detail="$2"
  echo "ALERT: $title"
  echo "$detail"
  # One open alert at a time — a flapping endpoint should not create fifty issues.
  if gh issue list --repo "$REPO" --label "$LABEL" --state open --limit 1 \
       --json number --jq '.[0].number' 2>/dev/null | grep -q '[0-9]'; then
    echo "(an alert issue is already open — not duplicating)"
    return
  fi
  # Do NOT swallow this. The first version redirected stderr to /dev/null and
  # printed "ALERT" while silently failing to create anything, because the
  # label did not exist — an alerting script that lies about having alerted is
  # worse than no alerting at all.
  local url
  if url="$(gh issue create --repo "$REPO" --label "$LABEL" \
    --title "$title" \
    --body "$(printf '%s\n\n```\n%s\n```\n\nChecked: %s\nURL: %s\n\nRunbook: docs/runbook.md' \
              "$detail" "$payload" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$URL")" 2>&1)"; then
    echo "(alert raised: $url)"
  else
    echo "(FAILED TO RAISE ALERT: $url)" >&2
  fi
}

case "$code" in
  200)
    echo "healthy — $payload"
    exit 0 ;;
  503)
    raise "parkmitra is degraded — a health check is failing" \
          "The service answered but reports itself degraded. If booking_guarantee is false the exclusion constraint is missing and DOUBLE BOOKINGS ARE POSSIBLE. See docs/runbook.md."
    exit 1 ;;
  *)
    raise "parkmitra is unreachable (HTTP ${code:-none})" \
          "The health endpoint did not answer."
    exit 2 ;;
esac
