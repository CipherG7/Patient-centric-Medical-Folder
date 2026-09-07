-- 001_initial.sql
-- Off-chain PostgreSQL schema for the Medical History System.
-- Only non-consensus-critical data lives here:
--   - User profiles (display info, contact)
--   - Session data
--   - UI-facing metadata cache
--
-- Consent, ownership, audit integrity all live on Sui.

CREATE TABLE IF NOT EXISTS user_profiles (
    user_address   VARCHAR(66) PRIMARY KEY,  -- Sui address (0x-prefixed hex)
    display_name   VARCHAR(128) NOT NULL DEFAULT '',
    email          VARCHAR(256),
    role           VARCHAR(16) NOT NULL DEFAULT 'patient'
                   CHECK (role IN ('patient', 'doctor', 'admin')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address   VARCHAR(66) NOT NULL REFERENCES user_profiles(user_address) ON DELETE CASCADE,
    token          VARCHAR(512) NOT NULL UNIQUE,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cache for off-chain metadata about medical histories.
-- Only the integrity-critical content hash & ownership live on Sui.
CREATE TABLE IF NOT EXISTS history_metadata (
    history_id     VARCHAR(66) PRIMARY KEY,  -- Sui object ID
    patient_addr   VARCHAR(66) NOT NULL,
    title          VARCHAR(256),
    description    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS institution_profiles (
    institution_addr VARCHAR(66) PRIMARY KEY, -- Sui address
    name             VARCHAR(256) NOT NULL,
    license_number   VARCHAR(128),
    contact_email    VARCHAR(256),
    website          VARCHAR(512),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_history_metadata_patient ON history_metadata(patient_addr);

