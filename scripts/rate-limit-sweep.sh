#!/usr/bin/env bash
#
# Delete rate-limit counters older than an hour.
#
# The limiter only ever reads the CURRENT minute, so anything older is dead
# weight. Without this the table grows one row per IP per minute for ever -
# a limiter that fills the database it is protecting has done more harm than
# the enumeration it prevents.
#
#   ./scripts/rate-limit-sweep.sh          # uses DATABASE_URL, or .env.local
#
# Suggested crontab, hourly:
#   0 * * * * cd /path/to/parkmitra && ./scripts/rate-limit-sweep.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" && -f .env.local ]]; then
  DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .env.local | head -1 | sed 's/^["'"'"']//; s/["'"'"']$//')
fi
: "${DATABASE_URL:?DATABASE_URL is not set}"

deleted=$(psql "$DATABASE_URL" -tA -v ON_ERROR_STOP=1 -c \
  "WITH gone AS (
     DELETE FROM rate_limit_hits
      WHERE window_min < now() - interval '1 hour'
      RETURNING 1
   ) SELECT count(*) FROM gone;")

echo "rate-limit sweep: removed ${deleted} expired counter row(s)"
