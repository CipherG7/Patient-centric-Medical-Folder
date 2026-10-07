ALTER TABLE offchain_audit_events
    ALTER COLUMN history_id DROP NOT NULL,
    ALTER COLUMN actor_addr DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS actor_role VARCHAR(32),
    ADD COLUMN IF NOT EXISTS target_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS target_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS access_scope VARCHAR(32),
    ADD COLUMN IF NOT EXISTS result VARCHAR(16) NOT NULL DEFAULT 'success',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE INDEX IF NOT EXISTS idx_offchain_audit_events_actor_time
    ON offchain_audit_events(actor_addr, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_offchain_audit_event_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'off-chain audit events are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offchain_audit_events_immutable ON offchain_audit_events;
CREATE TRIGGER offchain_audit_events_immutable
    BEFORE UPDATE OR DELETE ON offchain_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_offchain_audit_event_mutation();