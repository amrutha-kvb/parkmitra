-- =============================================================================
-- Seed data — reference areas + fictional parking spots + bays
-- =============================================================================
-- Idempotent: safe to run multiple times.
-- TRUNCATE … RESTART IDENTITY CASCADE wipes dependent rows and resets all
-- serial sequences, so re-running always produces the same IDs.
--
-- Area centroids are real Hyderabad coordinates.
-- Spot names, addresses, and lat/lng are entirely FICTIONAL — no real business
-- is named (see design/data-dictionary.md "Fictional in v1").
--
-- Money is stored in paise (₹1 = 100 paise).  price_per_hour_paise values
-- here range from 2 000 (₹20) to 6 000 (₹60), per ADR-003.
-- =============================================================================

TRUNCATE
    search_events,
    payments,
    bookings,
    bays,
    spots,
    areas
RESTART IDENTITY CASCADE;


-- =============================================================================
-- AREAS  (7 fixed rows)
-- =============================================================================
--
-- IDs will be assigned 1-7 in insertion order by smallserial.
-- lat/lng are approximate centroids of each neighbourhood.
--
INSERT INTO areas (slug, name, centre_lat, centre_lng) VALUES
    ('hitec-city',        'HITEC City',        17.4486,  78.3908),
    ('gachibowli',        'Gachibowli',        17.4401,  78.3489),
    ('madhapur',          'Madhapur',          17.4477,  78.3927),
    ('kondapur',          'Kondapur',          17.4600,  78.3615),
    ('hafeezpet',         'Hafeezpet',         17.4953,  78.3593),
    ('financial-district','Financial District', 17.4156,  78.3391),
    ('manikonda',         'Manikonda',         17.4067,  78.3830);


-- =============================================================================
-- SPOTS  (20 rows, ~3 per area; area_id references 1-7 above)
-- =============================================================================
--
-- Area ID reference:
--   1 → HITEC City          5 → Hafeezpet
--   2 → Gachibowli          6 → Financial District
--   3 → Madhapur            7 → Manikonda
--   4 → Kondapur
--
-- Variant hours (a minority, for realism):
--   Spot 4  : 06:00 – 22:00  (early-morning gym)
--   Spot 9  : 00:00 – 23:59  (near-24 h commercial block)
--   Spot 14 : 08:00 – 22:00  (office-campus hours)
--   Spot 18 : 06:30 – 23:00  (gym, early open)
-- All other spots: 07:00 – 23:00
--

INSERT INTO spots
    (area_id, name, kind, address_line,
     lat,       lng,
     price_per_hour_paise, opens_at,  closes_at, is_active)
VALUES
-- ── HITEC City (area_id = 1) ── 3 spots ─────────────────────────────────────
(1, 'Zenith Galleria Parking',
    'mall',
    '14-B, Zenith Galleria, Cyber Hills, HITEC City',
    17.4491,  78.3921,
    5000, '07:00', '23:00', true),

(1, 'Cobalt Towers Basement',
    'office',
    'Cobalt Towers, Phase-II, Madhapur Road, HITEC City',
    17.4472,  78.3898,
    4500, '07:00', '23:00', true),

(1, 'Vertex Residency Podium',
    'apartment',
    'Block C, Vertex Residency, Serilingampally, HITEC City',
    17.4505,  78.3875,
    3000, '07:00', '23:00', true),

-- ── Gachibowli (area_id = 2) ── 3 spots ─────────────────────────────────────
(2, 'Prism Sports Hub',
    'gym',
    '7, Prism Sports Hub, Gachibowli Stadium Road',
    17.4389,  78.3512,
    2500, '06:00', '22:00', true),

(2, 'Ovation Square Open-Air Lot',
    'commercial',
    'Ovation Square, Plot 22, Gachibowli Main Road',
    17.4415,  78.3478,
    2000, '07:00', '23:00', true),

(2, 'Axiom Business Centre',
    'office',
    'Axiom Business Centre, Survey No 48, Gachibowli',
    17.4370,  78.3502,
    4000, '07:00', '23:00', true),

-- ── Madhapur (area_id = 3) ── 3 spots ────────────────────────────────────────
(3, 'Solaris Mall Underground',
    'mall',
    'Solaris Mall, Plot 9, Jubilee Enclave, Madhapur',
    17.4488,  78.3940,
    5500, '07:00', '23:00', true),

(3, 'Crescent Lifestyle Tower',
    'apartment',
    'Crescent Lifestyle, Road No 36, Madhapur',
    17.4460,  78.3955,
    3500, '07:00', '23:00', true),

(3, 'Nexus Commercial Arcade',
    'commercial',
    'Nexus Arcade, Potheri Nagar, Madhapur',
    17.4475,  78.3912,
    2000, '00:00', '23:59', true),

-- ── Kondapur (area_id = 4) ── 3 spots ────────────────────────────────────────
(4, 'Pinnacle Fitness Arena',
    'gym',
    'Pinnacle Fitness, Block A, Kondapur Cross Roads',
    17.4622,  78.3630,
    2500, '07:00', '23:00', true),

(4, 'Skyridge Apartments Deck',
    'apartment',
    'Skyridge Apartments, Phase 3, Kondapur',
    17.4588,  78.3598,
    3000, '07:00', '23:00', true),

(4, 'Luminary Tech Park',
    'office',
    'Luminary Tech Park, Survey No 112, Kondapur',
    17.4611,  78.3651,
    4500, '07:00', '23:00', true),

-- ── Hafeezpet (area_id = 5) ── 3 spots ───────────────────────────────────────
(5, 'Meridian Mall Surface Lot',
    'mall',
    'Meridian Mall, Main Road, Hafeezpet',
    17.4970,  78.3605,
    4000, '07:00', '23:00', true),

(5, 'Indigo Techzone Campus',
    'office',
    'Indigo Techzone, Hafeezpet Ring Road',
    17.4938,  78.3570,
    6000, '08:00', '22:00', true),

(5, 'Copperleaf Residences',
    'apartment',
    'Copperleaf Residences, Lane 4, Hafeezpet',
    17.4962,  78.3618,
    2500, '07:00', '23:00', true),

-- ── Financial District (area_id = 6) ── 2 spots ──────────────────────────────
(6, 'Altitude One Office Tower',
    'office',
    'Altitude One, DLF Cybercity Road, Financial District',
    17.4163,  78.3405,
    6000, '07:00', '23:00', true),

(6, 'Granite Pointe Commercial Hub',
    'commercial',
    'Granite Pointe, Plot 6, Nanakramguda, Financial District',
    17.4148,  78.3378,
    4000, '07:00', '23:00', true),

-- ── Manikonda (area_id = 7) ── 3 spots ───────────────────────────────────────
(7, 'Opal Heights Basement',
    'apartment',
    'Opal Heights, Manikonda Village Road',
    17.4073,  78.3848,
    2500, '06:30', '23:00', true),

(7, 'Tandem Square Mall',
    'mall',
    'Tandem Square, Puppalaguda Road, Manikonda',
    17.4055,  78.3818,
    5000, '07:00', '23:00', true),

(7, 'Ironwood Business Enclave',
    'commercial',
    'Ironwood Business Enclave, Survey 77, Manikonda',
    17.4081,  78.3808,
    3500, '07:00', '23:00', true);


-- =============================================================================
-- BAYS
-- =============================================================================
--
-- Each spot gets 2-8 bays.  Labels follow the pattern <prefix>-<nn> where
-- prefix reflects the spot's character (B = basement, L = level, G = ground,
-- S = surface, P = podium, D = deck).
--
-- spot_id assignments match insertion order above (bigserial, starts at 1).
--

INSERT INTO bays (spot_id, label, is_active) VALUES
-- Spot 1 · Zenith Galleria Parking (mall, 6 bays)
(1,  'B-01', true),
(1,  'B-02', true),
(1,  'B-03', true),
(1,  'B-04', true),
(1,  'B-05', true),
(1,  'B-06', true),

-- Spot 2 · Cobalt Towers Basement (office, 5 bays)
(2,  'L1-01', true),
(2,  'L1-02', true),
(2,  'L1-03', true),
(2,  'L1-04', true),
(2,  'L1-05', true),

-- Spot 3 · Vertex Residency Podium (apartment, 4 bays)
(3,  'P-01', true),
(3,  'P-02', true),
(3,  'P-03', true),
(3,  'P-04', true),

-- Spot 4 · Prism Sports Hub (gym, 3 bays)
(4,  'G-01', true),
(4,  'G-02', true),
(4,  'G-03', true),

-- Spot 5 · Ovation Square Open-Air Lot (commercial, 8 bays)
(5,  'S-01', true),
(5,  'S-02', true),
(5,  'S-03', true),
(5,  'S-04', true),
(5,  'S-05', true),
(5,  'S-06', true),
(5,  'S-07', true),
(5,  'S-08', true),

-- Spot 6 · Axiom Business Centre (office, 5 bays)
(6,  'L2-01', true),
(6,  'L2-02', true),
(6,  'L2-03', true),
(6,  'L2-04', true),
(6,  'L2-05', true),

-- Spot 7 · Solaris Mall Underground (mall, 7 bays)
(7,  'B-01', true),
(7,  'B-02', true),
(7,  'B-03', true),
(7,  'B-04', true),
(7,  'B-05', true),
(7,  'B-06', true),
(7,  'B-07', true),

-- Spot 8 · Crescent Lifestyle Tower (apartment, 4 bays)
(8,  'P-01', true),
(8,  'P-02', true),
(8,  'P-03', true),
(8,  'P-04', true),

-- Spot 9 · Nexus Commercial Arcade (commercial, 6 bays)
(9,  'S-01', true),
(9,  'S-02', true),
(9,  'S-03', true),
(9,  'S-04', true),
(9,  'S-05', true),
(9,  'S-06', true),

-- Spot 10 · Pinnacle Fitness Arena (gym, 2 bays)
(10, 'G-01', true),
(10, 'G-02', true),

-- Spot 11 · Skyridge Apartments Deck (apartment, 5 bays)
(11, 'D-01', true),
(11, 'D-02', true),
(11, 'D-03', true),
(11, 'D-04', true),
(11, 'D-05', true),

-- Spot 12 · Luminary Tech Park (office, 8 bays)
(12, 'L1-01', true),
(12, 'L1-02', true),
(12, 'L1-03', true),
(12, 'L1-04', true),
(12, 'L1-05', true),
(12, 'L1-06', true),
(12, 'L1-07', true),
(12, 'L1-08', true),

-- Spot 13 · Meridian Mall Surface Lot (mall, 6 bays)
(13, 'S-01', true),
(13, 'S-02', true),
(13, 'S-03', true),
(13, 'S-04', true),
(13, 'S-05', true),
(13, 'S-06', true),

-- Spot 14 · Indigo Techzone Campus (office, 7 bays)
(14, 'B-01', true),
(14, 'B-02', true),
(14, 'B-03', true),
(14, 'B-04', true),
(14, 'B-05', true),
(14, 'B-06', true),
(14, 'B-07', true),

-- Spot 15 · Copperleaf Residences (apartment, 3 bays)
(15, 'P-01', true),
(15, 'P-02', true),
(15, 'P-03', true),

-- Spot 16 · Altitude One Office Tower (office, 8 bays)
(16, 'L1-01', true),
(16, 'L1-02', true),
(16, 'L1-03', true),
(16, 'L1-04', true),
(16, 'L2-01', true),
(16, 'L2-02', true),
(16, 'L2-03', true),
(16, 'L2-04', true),

-- Spot 17 · Granite Pointe Commercial Hub (commercial, 5 bays)
(17, 'S-01', true),
(17, 'S-02', true),
(17, 'S-03', true),
(17, 'S-04', true),
(17, 'S-05', true),

-- Spot 18 · Opal Heights Basement (apartment, 4 bays)
(18, 'B-01', true),
(18, 'B-02', true),
(18, 'B-03', true),
(18, 'B-04', true),

-- Spot 19 · Tandem Square Mall (mall, 7 bays)
(19, 'B-01', true),
(19, 'B-02', true),
(19, 'B-03', true),
(19, 'B-04', true),
(19, 'B-05', true),
(19, 'B-06', true),
(19, 'B-07', true),

-- Spot 20 · Ironwood Business Enclave (commercial, 3 bays)
(20, 'S-01', true),
(20, 'S-02', true),
(20, 'S-03', true);
