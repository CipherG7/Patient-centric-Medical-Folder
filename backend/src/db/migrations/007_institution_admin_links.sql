-- Link hospital-admin wallets to their registered institution.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS institution_addr VARCHAR(66)
  REFERENCES institution_profiles(institution_addr) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_institution
  ON user_profiles(institution_addr);
