-- 004_rate_limits.sql
-- Fixed-window rate-limit counters for the booking lookup endpoint.
-- Backed by Postgres (not Redis) because Neon is already available and
-- adding a vendor for defence-in-depth is not justified.
--
-- One row per IP per one-minute window.  The primary key is the upsert
-- conflict target:
--   INSERT ... ON CONFLICT (ip_addr, window_min)
--     DO UPDATE SET hits = hits + 1 RETURNING hits

CREATE TABLE IF NOT EXISTS rate_limit_hits (
    ip_addr    inet        NOT NULL,
    window_min timestamptz NOT NULL,
    hits       integer     NOT NULL DEFAULT 1,
    PRIMARY KEY (ip_addr, window_min)
);

-- Retention support.
--
-- Without a sweep this table grows one row per IP per minute, for ever. On a
-- free tier that is the kind of slow leak nobody notices until storage is the
-- problem, and a limiter that fills the database it protects has done more
-- harm than the enumeration it prevents.
--
-- Deleting on read would put a write on the hot path of every lookup, so the
-- sweep is a separate job (scripts/rate-limit-sweep.sh) and this index is what
-- makes it cheap.
CREATE INDEX IF NOT EXISTS rate_limit_hits_window_idx
    ON rate_limit_hits (window_min);
