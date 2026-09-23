-- =============================================================================
-- Migration 001 — rollback
-- =============================================================================
-- Reverses db/migrations/001_init.sql completely.
--
-- Drop order is the strict reverse of creation order so that FK constraints
-- are never violated: child tables before parent tables, extension last.
--
-- CASCADE is used on each DROP TABLE to also remove any dependent objects
-- (indexes, constraints) that were created alongside the table.  No data is
-- preserved.
-- =============================================================================

DROP TABLE IF EXISTS search_events CASCADE;
DROP TABLE IF EXISTS payments      CASCADE;
DROP TABLE IF EXISTS bookings      CASCADE;
DROP TABLE IF EXISTS bays          CASCADE;
DROP TABLE IF EXISTS spots         CASCADE;
DROP TABLE IF EXISTS areas         CASCADE;

-- Drop the extension last.  IF EXISTS guards against a partial-up state where
-- the extension was created but table creation subsequently failed.
DROP EXTENSION IF EXISTS btree_gist;
