-- Track institution access independently of the on-chain registry so API
-- authentication can enforce revocations immediately for existing sessions.
ALTER TABLE institution_profiles
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_institution_profiles_revoked_at
  ON institution_profiles(revoked_at);
