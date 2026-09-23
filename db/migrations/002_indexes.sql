-- 002_indexes.sql
-- Indexes from the "Keys and indexes" table in design/data-model.md.
-- The GiST index on bookings (bay_id, window_at) is omitted — the
-- exclusion constraint in 001 already creates it.

CREATE UNIQUE INDEX idx_areas_slug
    ON areas (slug);

CREATE INDEX idx_spots_area_active
    ON spots (area_id)
    WHERE is_active;

CREATE INDEX idx_bays_spot_active
    ON bays (spot_id)
    WHERE is_active;

CREATE UNIQUE INDEX idx_bookings_reference_code
    ON bookings (reference_code);

CREATE INDEX idx_bookings_status_window_upper
    ON bookings (status, (upper(window_at)));

CREATE INDEX idx_search_events_created_at
    ON search_events (created_at);
