-- Backfill URP priority fields for nodes missing them.
-- Hard resets to 0 for active tracking.

UPDATE nodes
SET priority = json_patch(
    priority,
    '{"access_count_30active":0,"access_count_90active":0,"session_touches":0,"access_history":[],"link_count":0}'
)
WHERE json_extract(priority, '$.access_count_30active') IS NULL;
