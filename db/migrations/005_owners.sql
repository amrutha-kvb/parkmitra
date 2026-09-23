-- =============================================================================
-- Migration 005 — owner capability tokens
-- =============================================================================
-- Reverse: db/migrations/005_owners_down.sql
--
-- Links a spot to the person who controls it via a capability token, per
-- ADR-004.  The token is the sole authorisation for the owner surface —
-- no accounts, no sessions, consistent with ADR-002.
--
-- Key decisions recorded here:
--   ADR-004  owner_token is a CSPRNG-generated, high-entropy capability.
--            Possession of the token is the authorisation; no other lookup
--            path exists.  The token must never appear in logs, page titles,
--            analytics events, or referrer headers.
--   ADR-002  The driver's reference_code model is unchanged.  Both
--            capabilities coexist; neither replaces the other.
--
-- Existing spots are unaffected.  A spot with no row in owners is simply
-- unreachable from the owner surface — driver-side search, availability,
-- and booking work exactly as before.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- owners
-- One row per owned spot.  Created at onboarding (manual in v1); the token is
-- handed to the owner out of band.
--
-- Personal data lives in owner_phone and owner_name — operational fields for
-- the team ("who did we give this token to?"), not login credentials and not
-- lookup keys.  No endpoint accepts a phone number or name to find an owner.
--
-- Revocation: set is_active = false and insert a new row with a fresh token.
-- The old row is kept for the audit trail; never hard-delete.
-- -----------------------------------------------------------------------------
CREATE TABLE owners (
    id          bigserial   PRIMARY KEY,
    spot_id     bigint      NOT NULL,
    owner_token text        NOT NULL,
    owner_phone text        NULL,                   -- PD
    owner_name  text        NULL,                   -- PD
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT owners_spot_id_fkey
        FOREIGN KEY (spot_id) REFERENCES spots (id),

    -- One active token per spot.  A revoked row (is_active = false) does not
    -- block a replacement.  Implemented as a unique partial index below rather
    -- than a table-level UNIQUE, because the constraint applies only to active
    -- rows.

    CONSTRAINT owners_owner_token_key UNIQUE (owner_token)
);

-- The lookup path: resolve an owner_token to a spot_id.  Only active rows
-- are ever queried, so the index is partial.
CREATE UNIQUE INDEX owners_spot_id_active_idx
    ON owners (spot_id)
    WHERE is_active;

-- Rate-limited endpoint hits this index; it must be fast.
-- The UNIQUE constraint on owner_token creates an implicit index, so no
-- additional index is needed for token lookups.
