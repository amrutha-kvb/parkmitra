#!/usr/bin/env bash
#
# Creates the database, applies every migration in order, and loads the seed.
# Safe to run repeatedly — it drops and recreates, so it is also the reset.
#
#   ./scripts/db-setup.sh                 # uses DATABASE_URL, or parkmitra_dev
#   DATABASE_URL=postgres://... ./scripts/db-setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DB_URL="${DATABASE_URL:-postgres://localhost:5432/parkmitra_dev}"
DB_NAME="$(basename "${DB_URL%%\?*}")"

echo "→ database: $DB_NAME"

# Only manage the lifecycle of a LOCAL database. A remote URL (Neon, etc.) is
# assumed to exist already — dropping someone's hosted database from a setup
# script would be an unpleasant surprise.
if [[ "$DB_URL" == *"localhost"* || "$DB_URL" == *"127.0.0.1"* ]]; then
  dropdb --if-exists "$DB_NAME" 2>/dev/null || true
  createdb "$DB_NAME"
  echo "  created"
fi

for f in db/migrations/0*.sql; do
  case "$f" in *_down.sql) continue ;; esac
  printf "→ %-52s" "$f"
  psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" -f "$f"
  echo "ok"
done

printf "→ %-52s" "db/seed.sql"
psql -q -v ON_ERROR_STOP=1 -d "$DB_URL" -f db/seed.sql
echo "ok"

psql -t -d "$DB_URL" -c \
  "SELECT '  ' || (SELECT count(*) FROM areas) || ' areas, '
               || (SELECT count(*) FROM spots) || ' spots, '
               || (SELECT count(*) FROM bays)  || ' bays';"

echo "✓ ready — run: npm run dev"
