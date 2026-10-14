CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_addr   VARCHAR(66) NOT NULL,
    actor_addr       VARCHAR(66),
    type             VARCHAR(64) NOT NULL,
    title            VARCHAR(256) NOT NULL,
    message          TEXT NOT NULL,
    metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications(recipient_addr, created_at DESC);

CREATE TABLE IF NOT EXISTS access_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_addr   VARCHAR(66) NOT NULL,
    patient_addr     VARCHAR(66) NOT NULL,
    status           VARCHAR(16) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'declined')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending
    ON access_requests(requester_addr, patient_addr)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_access_requests_patient
    ON access_requests(patient_addr, created_at DESC);
