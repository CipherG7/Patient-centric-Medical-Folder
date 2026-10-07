CREATE TABLE IF NOT EXISTS zklogin_challenges (
    challenge_id UUID PRIMARY KEY,
    nonce VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_zklogin_challenges_expiry
    ON zklogin_challenges(expires_at);