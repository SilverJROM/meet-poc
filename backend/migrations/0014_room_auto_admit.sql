ALTER TABLE rooms ADD COLUMN auto_admit INTEGER NOT NULL DEFAULT 0;

-- standing AGENTROOM: auto-admit any knocker so tests complete without host UI intervention
UPDATE rooms SET auto_admit = 1 WHERE slug = 'agentroom';
