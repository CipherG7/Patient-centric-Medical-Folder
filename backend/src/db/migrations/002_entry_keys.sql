-- 002_entry_keys.sql
-- Off-chain storage for per-entry AES-256-GCM keys.
--
-- Each entry has one 256-bit AES key. That key is encrypted ("wrapped")
-- with a key derived from each grantee's Sui address (via PBKDF2) and
-- stored here. This table contains one row per (entry, grantee) pair.
--
-- DESIGN RATIONALE (see encryption/index.ts for the full discussion):
--   Per-entry keys minimise the blast radius of a key compromise.
--   This approach aligns with the on-chain partial-access model where
--   a grantee may only be allowed to view specific entries.
--
--   In production, replace PBKDF2 wrapping with NaCl box
--   (X25519-XSalsa20-Poly1305) using per-user Curve25519 keypairs.

CREATE TABLE IF NOT EXISTS entry_keys (
    id                    SERIAL PRIMARY KEY,
    history_id            VARCHAR(66) NOT NULL,
    entry_id              BIGINT NOT NULL,
    grantee_addr          VARCHAR(66) NOT NULL,
    wrapped_key_iv        TEXT NOT NULL,
    wrapped_key_ciphertext TEXT NOT NULL,
    wrapped_key_tag       TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Each (history, entry, grantee) should have exactly one wrapped key
    UNIQUE (history_id, entry_id, grantee_addr)
);

-- Index for fast lookup when decrypting a document
CREATE INDEX IF NOT EXISTS idx_entry_keys_lookup
    ON entry_keys (history_id, entry_id, grantee_addr);

-- Index for access revocation checks
CREATE INDEX IF NOT EXISTS idx_entry_keys_grantee
    ON entry_keys (grantee_addr);

