-- Backfill ui_metadata for databases that already had vault rows before
-- ui_metadata was introduced. SQLite ADD COLUMN keeps the schema default for
-- future reads, but this explicit update guarantees stored values are valid.

UPDATE vaults
SET ui_metadata = '{}'
WHERE ui_metadata IS NULL;

UPDATE sub_vaults
SET ui_metadata = '{}'
WHERE ui_metadata IS NULL;
