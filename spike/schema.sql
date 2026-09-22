-- Spike: can the database, on its own, refuse to hand the same bay to two
-- drivers for overlapping windows — including when both requests arrive at the
-- same instant?
--
-- Throwaway. Not the real schema. The only question is whether the constraint
-- holds under concurrency, because if it does not, every booking path needs
-- application-level locking and the stack choice changes.

DROP TABLE IF EXISTS spike_bookings;

-- btree_gist lets an exclusion constraint mix equality (spot_id) with range
-- overlap (&&). Without it, EXCLUDE can only compare ranges.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE spike_bookings (
  id          bigserial PRIMARY KEY,
  spot_id     bigint      NOT NULL,
  window_at   tstzrange   NOT NULL,
  driver      text        NOT NULL,

  -- The whole spike in one line: same spot + overlapping window = rejected,
  -- enforced by the database rather than by whoever wrote the endpoint.
  CONSTRAINT no_double_booking
    EXCLUDE USING gist (spot_id WITH =, window_at WITH &&)
);
