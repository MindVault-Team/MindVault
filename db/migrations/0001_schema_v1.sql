CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    privacy_tier TEXT NOT NULL DEFAULT 'open' CHECK (privacy_tier IN ('open', 'local_only', 'locked', 'redacted')),
    priority_profile TEXT NOT NULL DEFAULT 'standard' CHECK (priority_profile IN ('slow', 'standard', 'fast', 'pinned')),
    summary_node_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    meta TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_vaults_privacy ON vaults(privacy_tier);
CREATE INDEX IF NOT EXISTS idx_vaults_deleted ON vaults(deleted_at);

CREATE TABLE IF NOT EXISTS sub_vaults (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id),
    name TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    privacy_tier TEXT,
    priority_profile TEXT,
    summary_node_id TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    meta TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sub_vaults_vault ON sub_vaults(vault_id);

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id),
    sub_vault_id TEXT REFERENCES sub_vaults(id),
    node_type TEXT NOT NULL DEFAULT 'concept' CHECK (node_type IN ('concept', 'fact', 'project', 'preference', 'event', 'instruction', 'identity', 'summary')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    detail TEXT,
    source TEXT,
    source_type TEXT CHECK (source_type IN ('manual', 'pdf_import', 'transcript_import', 'ai_transfer', 'agent_extract', 'onboarding')),
    privacy_tier TEXT CHECK (privacy_tier IS NULL OR privacy_tier IN ('open', 'local_only', 'locked', 'redacted')),
    priority TEXT NOT NULL DEFAULT '{"score":0.8,"profile":"standard","pinned":false,"access_count_30active":0,"access_count_90active":0,"access_history":[],"session_touches":0,"auto_trim_threshold":0.25}',
    version INTEGER NOT NULL DEFAULT 1,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    meta TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_nodes_vault ON nodes(vault_id);
CREATE INDEX IF NOT EXISTS idx_nodes_sub_vault ON nodes(sub_vault_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON nodes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_nodes_archived ON nodes(is_archived);
CREATE INDEX IF NOT EXISTS idx_nodes_accessed ON nodes(last_accessed);

CREATE TABLE IF NOT EXISTS node_embeddings (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    embedding BLOB NOT NULL,
    computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS node_tags (
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag_id);

CREATE TABLE IF NOT EXISTS doors (
    id TEXT PRIMARY KEY,
    source_node_id TEXT NOT NULL REFERENCES nodes(id),
    target_node_id TEXT REFERENCES nodes(id),
    target_vault_id TEXT REFERENCES vaults(id),
    label TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'orphaned', 'closed')),
    orphan_reason TEXT,
    orphan_since TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_doors_source ON doors(source_node_id);
CREATE INDEX IF NOT EXISTS idx_doors_target ON doors(target_node_id);
CREATE INDEX IF NOT EXISTS idx_doors_status ON doors(status);

CREATE TABLE IF NOT EXISTS backlinks (
    id TEXT PRIMARY KEY,
    target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    door_id TEXT NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (target_node_id, door_id)
);

CREATE INDEX IF NOT EXISTS idx_backlinks_target ON backlinks(target_node_id);
CREATE INDEX IF NOT EXISTS idx_backlinks_source ON backlinks(source_node_id);

CREATE TABLE IF NOT EXISTS changesets (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'partial')),
    item_count INTEGER NOT NULL DEFAULT 0,
    accepted_count INTEGER NOT NULL DEFAULT 0,
    dismissed_count INTEGER NOT NULL DEFAULT 0,
    model_used TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_changesets_status ON changesets(status);

CREATE TABLE IF NOT EXISTS changeset_items (
    id TEXT PRIMARY KEY,
    changeset_id TEXT NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('add', 'update', 'merge', 'delete', 'repoint_door', 'orphan_alert')),
    target_node_id TEXT REFERENCES nodes(id),
    proposed_data TEXT NOT NULL DEFAULT '{}',
    existing_data TEXT DEFAULT '{}',
    similarity REAL,
    merge_with_id TEXT REFERENCES nodes(id),
    door_id TEXT REFERENCES doors(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed', 'edited')),
    reviewed_at TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_changeset_items_changeset ON changeset_items(changeset_id);
CREATE INDEX IF NOT EXISTS idx_changeset_items_status ON changeset_items(status);
CREATE INDEX IF NOT EXISTS idx_changeset_items_target ON changeset_items(target_node_id);

CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL REFERENCES vaults(id),
    version INTEGER NOT NULL,
    trigger TEXT NOT NULL CHECK (trigger IN ('session_close', 'changeset_accepted', 'manual')),
    changeset_id TEXT REFERENCES changesets(id),
    node_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT
);

CREATE TABLE IF NOT EXISTS snapshot_nodes (
    snapshot_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_data TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_vault ON snapshots(vault_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_version ON snapshots(vault_id, version);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    vault_id TEXT REFERENCES vaults(id),
    scope_json TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    summary TEXT
);

CREATE TABLE IF NOT EXISTS session_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    node_refs TEXT DEFAULT '[]',
    token_count INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_vault ON sessions(vault_id);
CREATE INDEX IF NOT EXISTS idx_session_msgs_sess ON session_messages(session_id);

CREATE TABLE IF NOT EXISTS routing_feedback (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('scope_accept', 'scope_reject', 'scope_adjust', 'diff_accept', 'diff_reject', 'diff_edit')),
    proposed_scope TEXT,
    accepted_scope TEXT,
    vault_id TEXT REFERENCES vaults(id),
    query_embedding BLOB,
    reward REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_routing_feedback_vault ON routing_feedback(vault_id);
CREATE INDEX IF NOT EXISTS idx_routing_feedback_type ON routing_feedback(feedback_type);

CREATE TABLE IF NOT EXISTS import_jobs (
    id TEXT PRIMARY KEY,
    import_type TEXT NOT NULL CHECK (import_type IN ('pdf', 'markdown', 'transcript', 'ai_transfer', 'obsidian', 'notion', 'csv')),
    source_name TEXT,
    target_vault_id TEXT REFERENCES vaults(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'staged', 'committed', 'failed')),
    changeset_id TEXT REFERENCES changesets(id),
    node_count INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS privacy_overrides (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    privacy_tier TEXT NOT NULL CHECK (privacy_tier IN ('open', 'local_only', 'locked', 'redacted')),
    set_at TEXT NOT NULL DEFAULT (datetime('now')),
    set_by TEXT DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_orphan_doors_on_delete
AFTER UPDATE ON nodes
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
    UPDATE doors
    SET status = 'orphaned',
        orphan_reason = 'target_deleted',
        orphan_since = datetime('now'),
        updated_at = datetime('now')
    WHERE target_node_id = OLD.id
      AND status = 'active';
END;

CREATE TRIGGER IF NOT EXISTS trg_orphan_doors_on_archive
AFTER UPDATE ON nodes
WHEN NEW.is_archived = 1 AND OLD.is_archived = 0
BEGIN
    UPDATE doors
    SET status = 'orphaned',
        orphan_reason = 'target_merged',
        orphan_since = datetime('now'),
        updated_at = datetime('now')
    WHERE target_node_id = OLD.id
      AND status = 'active';
END;

CREATE TRIGGER IF NOT EXISTS trg_backlink_on_door_insert
AFTER INSERT ON doors
WHEN NEW.target_node_id IS NOT NULL
BEGIN
    INSERT OR IGNORE INTO backlinks (id, target_node_id, source_node_id, door_id)
    VALUES (hex(randomblob(8)), NEW.target_node_id, NEW.source_node_id, NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS trg_backlink_on_door_delete
AFTER DELETE ON doors
BEGIN
    DELETE FROM backlinks WHERE door_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_invalidate_embedding_on_update
AFTER UPDATE ON nodes
WHEN NEW.summary != OLD.summary OR NEW.detail != OLD.detail
BEGIN
    DELETE FROM node_embeddings WHERE node_id = NEW.id;
END;
