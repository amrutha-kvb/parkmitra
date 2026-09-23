-- 005_owners — rollback
-- Reverses db/migrations/005_owners.sql.

DROP TABLE IF EXISTS owners CASCADE;
