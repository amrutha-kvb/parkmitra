-- =============================================================================
-- Migration 001 — initial schema
-- =============================================================================
-- Reverse: db/migrations/001_init_down.sql
--
-- Column types, constraints, and index strategy are derived from:
--   design/data-model.md
--   design/data-dictionary.md
--
-- Key decisions recorded here:
--   ADR-001  Exclusion constraint prevents overlapping bookings per bay when
--            status <> 'cancelled'.  Window is half-open [start, end) so two
--            adjacent bookings do NOT conflict (&&-operator semantics).
--   ADR-002  reference_code is the sole external identifier for a booking;
--            it must be unique and is treated as a secret.
--   ADR-003  All money is stored in integer paise (₹1 = 100 paise) to avoid
--            floating-point rounding.
-- =============================================================================

-- btree_gist is required so that the integer column (bay_id) can participate
-- in the GiST exclusion index alongside the tstzrange column (window_at).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- areas
-- Seven fixed Hyderabad areas.  Rows are seeded separately; this table is
-- reference data and is never hard-deleted.
-- -----------------------------------------------------------------------------
CREATE TABLE areas (
    id          smallserial PRIMARY KEY,
    slug        text        NOT NULL,
    name        text        NOT NULL,
    centre_lat  double precision NOT NULL,
    centre_lng  double precision NOT NULL,

    CONSTRAINT areas_slug_key UNIQUE (slug)
);

-- URL-based lookups always resolve through the slug.
-- The UNIQUE constraint creates this index implicitly; no extra index needed.

-- -----------------------------------------------------------------------------
-- spots
-- A venue (mall, apartment complex, gym, …).  Fictional in v1.
-- Soft-deleted via is_active; never hard-delete a spot that has bookings.
-- -----------------------------------------------------------------------------
CREATE TABLE spots (
    id                    bigserial PRIMARY KEY,
    area_id               smallint  NOT NULL,
    name                  text      NOT NULL,
    kind                  text      NOT NULL,
    address_line          text      NOT NULL,
    lat                   double precision NOT NULL,
    lng                   double precision NOT NULL,
    price_per_hour_paise  integer   NOT NULL,
    opens_at              time      NOT NULL,
    closes_at             time      NOT NULL,
    is_active             boolean   NOT NULL DEFAULT true,

    CONSTRAINT spots_area_id_fkey
        FOREIGN KEY (area_id) REFERENCES areas (id),

    CONSTRAINT spots_kind_check
        CHECK (kind IN ('mall', 'apartment', 'office', 'gym', 'commercial')),

    CONSTRAINT spots_price_per_hour_paise_check
        CHECK (price_per_hour_paise >= 0)
);

-- Every availability search filters by area and active status.
CREATE INDEX spots_area_id_active_idx
    ON spots (area_id)
    WHERE is_active;

-- -----------------------------------------------------------------------------
-- bays
-- ONE physical parking space — the unit that gets booked.
-- The exclusion constraint on bookings keys on bay_id, not spot_id, because a
-- spot with 40 bays must be bookable 40 times in parallel.
-- -----------------------------------------------------------------------------
CREATE TABLE bays (
    id        bigserial PRIMARY KEY,
    spot_id   bigint    NOT NULL,
    label     text      NOT NULL,
    is_active boolean   NOT NULL DEFAULT true,

    CONSTRAINT bays_spot_id_fkey
        FOREIGN KEY (spot_id) REFERENCES spots (id)
);

-- Joining bays to their parent spot (the hot path in availability queries).
CREATE INDEX bays_spot_id_active_idx
    ON bays (spot_id)
    WHERE is_active;

-- -----------------------------------------------------------------------------
-- bookings
-- Core transactional table.  Personal data lives only here and only in the
-- three fields marked PD.
-- -----------------------------------------------------------------------------
CREATE TABLE bookings (
    id             bigserial    PRIMARY KEY,
    bay_id         bigint       NOT NULL,
    window_at      tstzrange    NOT NULL,
    driver_phone   text         NOT NULL,           -- PD
    driver_name    text         NULL,               -- PD, optional
    vehicle_reg    text         NOT NULL,           -- PD
    reference_code text         NOT NULL,
    amount_paise   integer      NOT NULL,
    status         text         NOT NULL,
    arrived_at     timestamptz  NULL,
    created_at     timestamptz  NOT NULL DEFAULT now(),

    -- ADR-002: reference_code is the only external handle for a booking.
    CONSTRAINT bookings_reference_code_key UNIQUE (reference_code),

    CONSTRAINT bookings_bay_id_fkey
        FOREIGN KEY (bay_id) REFERENCES bays (id),

    CONSTRAINT bookings_status_check
        CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),

    -- Window must have positive duration.
    CONSTRAINT bookings_window_duration_check
        CHECK (upper(window_at) > lower(window_at)),

    CONSTRAINT bookings_amount_paise_check
        CHECK (amount_paise >= 0),

    -- ADR-001: No two non-cancelled bookings may overlap for the same bay.
    -- The half-open [start, end) range means adjacent bookings do not conflict.
    -- btree_gist is required so that bay_id (integer) can share a GiST index
    -- with window_at (tstzrange).  The index created here is also the structure
    -- used by availability queries (the && operator hits this index).
    CONSTRAINT bookings_no_overlapping_active
        EXCLUDE USING gist (
            bay_id   WITH =,
            window_at WITH &&
        )
        WHERE (status <> 'cancelled')
);

-- Fast expiry sweep: find pending bookings whose window has already ended.
CREATE INDEX bookings_status_upper_window_idx
    ON bookings (status, upper(window_at));

-- -----------------------------------------------------------------------------
-- payments
-- One payment row per booking in v1.  provider='simulated' throughout v1;
-- the column exists so adding a real gateway requires only a value change.
-- No card data is ever stored here (see data-dictionary.md).
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
    id           bigserial   PRIMARY KEY,
    booking_id   bigint      NOT NULL,
    amount_paise integer     NOT NULL,
    provider     text        NOT NULL,
    status       text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT payments_booking_id_fkey
        FOREIGN KEY (booking_id) REFERENCES bookings (id),

    CONSTRAINT payments_status_check
        CHECK (status IN ('pending', 'paid', 'failed'))
);

-- -----------------------------------------------------------------------------
-- search_events
-- Analytics-only.  Deliberately contains no personal data and no IP address.
-- No FK to a users table — session_id is an ephemeral random per-visit value.
-- area_id FK is kept for referential hygiene; it is never joined on hot paths.
-- -----------------------------------------------------------------------------
CREATE TABLE search_events (
    id           bigserial   PRIMARY KEY,
    session_id   text        NOT NULL,
    area_id      smallint    NOT NULL,
    window_start timestamptz NOT NULL,
    window_end   timestamptz NOT NULL,
    result_count integer     NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT search_events_area_id_fkey
        FOREIGN KEY (area_id) REFERENCES areas (id)
);

-- Retention sweep (90-day rule) and time-series metrics both scan by created_at.
CREATE INDEX search_events_created_at_idx
    ON search_events (created_at);
