-- 006_rate_limit_scopes.sql
-- Give rate-limit counters a scope, so each endpoint gets its own bucket.
--
-- Before this the key was (ip_addr, window_min), meaning every endpoint that
-- called the limiter shared ONE allowance per IP. With only the booking lookup
-- wired up that was invisible. Extending the limiter to searching, listing bays
-- and creating bookings would have made an ordinary visitor exhaust a single
-- 20/minute budget across unrelated actions and be locked out of the product by
-- its own defence.
--
-- 'lookup' is the default so the existing rows keep meaning what they meant.

ALTER TABLE rate_limit_hits
    ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'lookup';

-- The conflict target of the upsert has to be the full key, so the primary key
-- moves with it. Dropping and re-adding is safe here: the table holds only
-- short-lived counters, swept hourly, and losing a partial minute of counts is
-- not worth a more elaborate migration.
ALTER TABLE rate_limit_hits DROP CONSTRAINT IF EXISTS rate_limit_hits_pkey;
ALTER TABLE rate_limit_hits
    ADD CONSTRAINT rate_limit_hits_pkey PRIMARY KEY (ip_addr, scope, window_min);
