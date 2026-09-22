-- Repair databases created from the earlier import-table shape. The import
-- route uses (history_id, entry_id) as its idempotency key.

CREATE UNIQUE INDEX IF NOT EXISTS history_import_entries_history_entry_uidx
    ON history_import_entries(history_id, entry_id);