#!/usr/bin/env bash
# Spike runner. Throwaway — proves or kills one assumption, then gets deleted
# from the mind if not from the repo.
#
# Assumption under test: Postgres can refuse an overlapping booking for the same
# spot ATOMICALLY, with no application-level locking, including when two
# requests race.
#
# Usage: ./spike/run.sh    (needs a local postgres and a parkmitra_spike db)
set -u
DB=parkmitra_spike

echo "══════════ setup ══════════"
psql -q -d "$DB" -f "$(dirname "$0")/schema.sql" || exit 1
echo "schema loaded"
echo

echo "══════════ 1. a plain booking is accepted ══════════"
psql -d "$DB" -c "INSERT INTO spike_bookings (spot_id, window_at, driver)
  VALUES (1, tstzrange('2026-09-23 10:00+05:30','2026-09-23 12:00+05:30'), 'amrutha');"
echo

echo "══════════ 2. an OVERLAPPING booking for the same spot is rejected ══════════"
psql -d "$DB" -c "INSERT INTO spike_bookings (spot_id, window_at, driver)
  VALUES (1, tstzrange('2026-09-23 11:00+05:30','2026-09-23 13:00+05:30'), 'someone-else');"
echo "exit=$?  (non-zero means the database refused it, which is what we want)"
echo

echo "══════════ 3. an ADJACENT booking is allowed (12:00 start after 12:00 end) ══════════"
psql -d "$DB" -c "INSERT INTO spike_bookings (spot_id, window_at, driver)
  VALUES (1, tstzrange('2026-09-23 12:00+05:30','2026-09-23 14:00+05:30'), 'adjacent-ok');"
echo

echo "══════════ 4. the SAME window on a DIFFERENT spot is allowed ══════════"
psql -d "$DB" -c "INSERT INTO spike_bookings (spot_id, window_at, driver)
  VALUES (2, tstzrange('2026-09-23 10:00+05:30','2026-09-23 12:00+05:30'), 'different-spot');"
echo

echo "══════════ 5. THE REAL TEST: 10 concurrent racers, same spot, same window ══════════"
echo "Only one may win. If two win, the constraint is decorative and every"
echo "booking endpoint needs its own lock."
psql -q -d "$DB" -c "DELETE FROM spike_bookings WHERE spot_id = 99;"
for i in $(seq 1 10); do
  psql -q -d "$DB" -c "INSERT INTO spike_bookings (spot_id, window_at, driver)
    VALUES (99, tstzrange('2026-09-23 18:00+05:30','2026-09-23 20:00+05:30'), 'racer-$i');" \
    >/dev/null 2>&1 &
done
wait
echo
echo "winners for spot 99 (expect exactly 1):"
psql -d "$DB" -c "SELECT count(*) AS winners, string_agg(driver, ',') AS who
  FROM spike_bookings WHERE spot_id = 99;"
echo

echo "══════════ final state ══════════"
psql -d "$DB" -c "SELECT id, spot_id, driver, window_at FROM spike_bookings ORDER BY spot_id, id;"
