CREATE TABLE IF NOT EXISTS offchain_audit_events (
    id          BIGSERIAL PRIMARY KEY,
    history_id  VARCHAR(66) NOT NULL,
    actor_addr  VARCHAR(66) NOT NULL,
    action      VARCHAR(64) NOT NULL,
    entry_id    INTEGER,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offchain_audit_events_history_time
    ON offchain_audit_events(history_id, occurred_at DESC);