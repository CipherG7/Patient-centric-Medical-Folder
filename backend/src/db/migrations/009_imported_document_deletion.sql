ALTER TABLE history_import_entries
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;