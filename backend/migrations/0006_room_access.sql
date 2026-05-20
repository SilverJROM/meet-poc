ALTER TABLE rooms ADD COLUMN is_open INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN wait_timeout_minutes REAL NOT NULL DEFAULT 15;

UPDATE rooms
SET is_open = COALESCE(is_open, 0),
    wait_timeout_minutes = COALESCE(wait_timeout_minutes, 15);
