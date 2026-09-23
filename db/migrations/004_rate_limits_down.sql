-- 004_rate_limits — rollback
-- Reverses db/migrations/004_rate_limits.sql.

DROP TABLE IF EXISTS rate_limit_hits CASCADE;
