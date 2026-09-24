-- 007_phone_verification — rollback
-- Reverses db/migrations/007_phone_verification.sql.

DROP TABLE IF EXISTS phone_otp CASCADE;
ALTER TABLE bookings DROP COLUMN IF EXISTS phone_verified;
