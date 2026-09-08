-- Parsed records imported by a patient. The on-chain entry remains the
-- source of truth for ownership and integrity; this table stores display data.
CREATE TABLE IF NOT EXISTS history_import_entries (
    history_id   VARCHAR(66) NOT NULL,
    entry_id     INTEGER NOT NULL,
    source_name  VARCHAR(256) NOT NULL,
    record       JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (history_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_history_import_entries_history
    ON history_import_entries(history_id);
