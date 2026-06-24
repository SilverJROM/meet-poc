ALTER TABLE users ADD COLUMN is_superuser INTEGER NOT NULL DEFAULT 0;

UPDATE users SET is_superuser = 1 WHERE email = 'silverjrom@gmail.com';