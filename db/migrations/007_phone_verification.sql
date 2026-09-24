-- =============================================================================
-- Migration 007 — phone verification (OTP)
-- =============================================================================
-- Reverse: db/migrations/007_phone_verification_down.sql
--
-- Adds the schema for phone OTP verification on bookings. The OTP flow is
-- designed so that NO endpoint accepts a phone number as input — the phone
-- is read from the booking row on the server side, after the caller proves
-- they hold the reference_code. This prevents the phone-number oracle attack:
-- an attacker submitting phone numbers to discover which ones have bookings.
-- See design/threat-model.md T1 and ADR-002.
--
-- Key decisions:
--   - phone_otp is keyed by booking_id, NOT by phone number. A phone→OTP
--     mapping would create a global verified-phone registry, one step from
--     the phone→bookings lookup the capability model exists to prevent.
--   - The OTP value is stored as a hash (SHA-256), not in cleartext. A leaked
--     or dumped table does not hand an attacker valid codes.
--   - Attempt counting and expiry are in the row, not in application state,
--     so they survive process restarts and serverless cold starts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- bookings.phone_verified
-- Whether the driver has completed OTP verification for this booking.
-- Defaults to false; all existing bookings become unverified.
-- The pay route will require this to be true before authorising payment.
-- -----------------------------------------------------------------------------
ALTER TABLE bookings
    ADD COLUMN phone_verified boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- phone_otp
-- One active OTP per booking at a time. A resend invalidates the previous row
-- (the unique constraint on booking_id enforces at most one live row; a resend
-- DELETEs the old row before inserting).
--
-- The table deliberately contains NO phone number column. The phone is on the
-- booking; duplicating it here would create a second index on PD that serves
-- no query the application makes. Stated so a future migration does not add
-- one for convenience.
-- -----------------------------------------------------------------------------
CREATE TABLE phone_otp (
    id           bigserial   PRIMARY KEY,
    booking_id   bigint      NOT NULL,

    -- SHA-256 hex digest of the 6-digit OTP. Never store the code in        -- PD (derived)
    -- cleartext — a table dump must not yield valid codes.
    code_hash    text        NOT NULL,

    expires_at   timestamptz NOT NULL,
    attempts     integer     NOT NULL DEFAULT 0,
    used         boolean     NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT phone_otp_booking_id_fkey
        FOREIGN KEY (booking_id) REFERENCES bookings (id),

    -- At most one live OTP per booking. A resend deletes the old row first.
    CONSTRAINT phone_otp_booking_id_key UNIQUE (booking_id),

    CONSTRAINT phone_otp_attempts_check
        CHECK (attempts >= 0 AND attempts <= 5)
);
