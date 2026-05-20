ALTER TABLE rooms ADD COLUMN slug TEXT;

UPDATE rooms
SET slug =
  lower(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(trim(title), ' ', '-'),
                    '_', '-'
                  ),
                  '/', '-'
                ),
                '.', '-'
              ),
              ':', '-'
            ),
            '&', 'and'
          ),
          '''', ''
        ),
        '"', ''
      ),
      '--', '-'
    )
  ) || '-' || substr(id, 1, 6)
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_slug_unique ON rooms(slug) WHERE slug IS NOT NULL;
