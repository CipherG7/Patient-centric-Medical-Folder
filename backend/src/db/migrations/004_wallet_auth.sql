-- Wallet-authentication challenges and expanded application roles.

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('patient', 'doctor', 'lab_tech', 'pharmacist', 'hospital_admin', 'platform_admin'));

CREATE TABLE IF NOT EXISTS auth_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(66) NOT NULL,
    message TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry ON auth_challenges(expires_at);