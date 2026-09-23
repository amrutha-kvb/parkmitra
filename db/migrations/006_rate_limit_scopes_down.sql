-- 006_rate_limit_scopes — rollback
-- Reverses db/migrations/006_rate_limit_scopes.sql.
--
-- Collapsing scopes back into one bucket would make the key non-unique, so the
-- rows go first. They are ephemeral counters swept hourly; nothing depends on
-- their history.

DELETE FROM rate_limit_hits;
ALTER TABLE rate_limit_hits DROP CONSTRAINT IF EXISTS rate_limit_hits_pkey;
ALTER TABLE rate_limit_hits
    ADD CONSTRAINT rate_limit_hits_pkey PRIMARY KEY (ip_addr, window_min);
ALTER TABLE rate_limit_hits DROP COLUMN IF EXISTS scope;
