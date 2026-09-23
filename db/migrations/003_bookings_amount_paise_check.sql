ALTER TABLE bookings
    ADD CONSTRAINT chk_bookings_amount_paise_non_negative
    CHECK (amount_paise >= 0);
