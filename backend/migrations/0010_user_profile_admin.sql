ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

-- Backfill display_name with the email local-part for existing users.
UPDATE users
SET display_name = CASE
  WHEN instr(email, '@') > 0 THEN substr(email, 1, instr(email, '@') - 1)
  ELSE email
END
WHERE display_name IS NULL OR display_name = '';

-- Seed the superusers.
UPDATE users SET is_admin = 1 WHERE email IN ('silverjrom@gmail.com', 'jrom@silverjrom.app');
