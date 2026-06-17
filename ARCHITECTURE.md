# Amber — Architecture Guide

> **Local-first AI memory system** | Tauri v2 · Rust · React 19 · TypeScript · AGPLv3

This document is how Amber is structured. Before opening a PR, please read the sections relevant to what you're changing. The rules here aren't arbitrary.

---

## Table of Contents

1. [Project Philosophy](#1-project-philosophy)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architectural Boundaries](#4-architectural-boundaries)
5. [Error Handling](#5-error-handling)
6. [Security Rules](#6-security-rules)
7. [Frontend Standards](#7-frontend-standards)
8. [AI / LLM Pipeline](#8-ai--llm-pipeline)
9. [Testing](#9-testing)
10. [Logging](#10-logging)
11. [Quick Reference](#11-quick-reference)

---

## 1. Project Philosophy

Amber is **privacy-by-architecture**, not privacy-by-policy. The user's Vault data never leaves their device unless they explicitly opt into cloud sync. This isn't a setting that can be toggled off — it's baked into how the system is built.

When in doubt about a design decision, ask: *"Does this give the user's data a path off their device that they didn't knowingly approve?"* If yes, it's the wrong approach.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Desktop runtime | Tauri v2 |
| Backend / business logic | Rust |
| Database | SQLite via `rusqlite` (synchronous) |
| Frontend | React 19 + TypeScript + Vite |
| Secret storage | OS keychain via `keyring` crate |
| Vector database | Qdrant (preferred) or Chroma — local mode |
| Local LLM server | Ollama |
| Session state / pruning | LangGraph |
| Retrieval pipeline | LlamaIndex or LangChain |

**Key Rust dependencies:** `tauri v2`, `rusqlite`, `keyring`, `secrecy`, `governor`, `serde`, `serde_json`, `thiserror`, `tokio` (runtime only, not for DB)

**Key UI dependencies:** `react 19`, `typescript`, `vite`, `react-markdown`, `rehype-sanitize`, `@tauri-apps/api v2`

---

## 3. Project Structure

```
/core/src/
  commands/     Tauri command handlers — thin layer: validate input, call domain
  domain/       Business logic (vaults, nodes, doors, decay, memory_agent)
  db/           All SQLite queries — parameterized only, no exceptions
  llm/          LLM client, prompt assembly, privacy filter
  fs.rs         safe_join and all filesystem utilities
  error.rs      AppError enum — the single source of truth for all errors
  state.rs      AppState (Mutex<Connection>, rate limiters, config)

/ui/src/
  components/   React components — no invoke calls, no business logic
  hooks/        Custom React hooks
  services/     Typed async functions — the only place ipc.ts is called
  ipc.ts        Raw invoke wrapper — typed, one file, never imported by components
  types/        Shared TypeScript types (mirroring Rust structs)

/db/migrations/ Versioned SQL migration files
```

---

## 4. Architectural Boundaries

These are the structural rules that hold the app together. Breaking them tends to create security holes or makes the codebase unmaintainable fast.

### 4.1 — Frontend and Backend are Strictly Separated

Rust logic lives in `/core/src/`. React lives in `/ui/src/`. The **only** bridge between them is Tauri IPC. There is no shared code, no shared state, and no workarounds.

### 4.2 — Components Don't Call IPC Directly

React components must never call `invoke()` themselves. Instead, they call typed async functions from `/ui/src/services/` (e.g., `vaults.ts`, `nodes.ts`), which are the only files that touch `ipc.ts`.

```typescript
// ❌ Wrong — component reaches into IPC directly
const result = await invoke('node_update', { id, title });

// ✅ Correct — component calls the service layer
import { updateNode } from '@/services/nodes';
const result = await updateNode({ id, title });
```

This keeps components testable, keeps IPC calls typed in one place, and makes it easy to see the full surface area of backend communication.

### 4.3 — Database Access is Synchronous and Centralized

We use synchronous `rusqlite` — not `sqlx`, not async Tokio DB ops. The connection lives in `Mutex<Connection>` inside Tauri's managed state and is accessed only from command handlers.

```rust
// ✅ Correct pattern for all command handlers
#[tauri::command]
fn node_create(
    state: tauri::State<AppState>,
    payload: NodeCreatePayload,
) -> Result<NodeResponse, AppError> {
    let db = state.db.lock().map_err(|_| AppError::LockPoisoned)?;
    // synchronous db operations here
}
```

### 4.4 — LLM Calls Happen in Rust, Never in JavaScript

This is a privacy enforcement boundary and it cannot move to the frontend. The full flow is:

1. Rust fetches nodes from SQLite
2. Rust runs the privacy tier filter (strips Locked / Local-Only content)
3. Rust assembles the final prompt
4. Rust makes the outbound HTTP call to the LLM provider
5. Rust returns only the response text to the frontend

The frontend sends: `{ query: string, scope: ScopeConfig }`
The frontend receives: `{ response: string, cited_nodes: string[] }`

If prompt assembly or LLM calls were moved to JavaScript, it would be trivially easy for a bug or malicious extension to exfiltrate data. Don't move this logic.

### 4.5 — Secrets Never Cross the IPC Boundary

API keys, OAuth tokens, and any other credentials must:

- **Never** be sent from Rust to JavaScript
- **Never** be stored in SQLite, `.env` files, or any file on disk
- Live exclusively in the OS keychain (`keyring` crate), held in memory only as `secrecy::SecretString` (which zeroes memory on drop)

```rust
// ✅ Correct — key is retrieved and used within the same Rust scope
fn call_llm_api(prompt: &str, provider: &str) -> Result<String, AppError> {
    let entry = Entry::new("amber", provider)?;
    let key = secrecy::Secret::new(entry.get_password()?);
    http_client::post(endpoint, key.expose_secret(), prompt)
    // key drops here, memory is zeroed automatically
}
```

---

## 5. Error Handling

### 5.1 — Use `AppError`, Not `Result<T, String>`

Tauri commands must never return `Result<T, String>`. Instead, every error goes through the `AppError` enum defined in `/core/src/error.rs`. It implements `serde::Serialize` so Tauri can send structured errors across IPC, and the frontend switches on typed error codes rather than fragile string matching.

Never use `.unwrap()`, `.expect()`, or `panic!()` in non-test code.

```rust
// /core/src/error.rs
#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("Database error: {0}")]        Database(String),
    #[error("Node not found: {0}")]        NotFound(String),
    #[error("Invalid input: {0}")]         InvalidInput(String),
    #[error("Privacy violation: ...")]     PrivacyViolation,
    #[error("Path traversal detected")]    PathTraversal,
    #[error("Rate limit exceeded")]        RateLimited,
    #[error("Lock poisoned")]              LockPoisoned,
    #[error("Keychain error: {0}")]        Keychain(String),
    #[error("LLM provider error: {0}")]    LlmProvider(String),
    #[error("Serialization error: {0}")]   Serialization(String),
}
```

The TypeScript side mirrors this enum in `/ui/src/types/errors.ts`.

### 5.2 — Propagate Errors, Don't Swallow Them

```rust
// ❌ Wrong — silently hides the error
let node = db.query_row(...).unwrap_or_default();

// ✅ Correct — propagates with proper context
let node = db.query_row(...).map_err(AppError::from)?;
```

---

## 6. Security Rules

These rules exist because of real vulnerabilities. Each one is load-bearing.

### 6.1 — Parameterized SQL Queries Only

Never use string formatting or concatenation to build SQL. Always use `rusqlite` positional parameters (`?1`, `?2`, ...).

```rust
// ❌ Wrong — SQL injection vulnerability
let q = format!("SELECT * FROM nodes WHERE vault_id = '{}'", vault_id);
conn.execute(&q, [])?;

// ✅ Correct
let mut stmt = conn.prepare(
    "SELECT * FROM nodes WHERE vault_id = ?1 AND is_archived = 0"
)?;
stmt.query_map(params![vault_id.as_str()], |row| { ... })?;
```

### 6.2 — Validate All IPC Inputs with Newtypes

Every Tauri command must validate its full input payload using newtype wrappers **before** any business logic or database access runs. Newtypes enforce invariants at the type level so invalid data can't sneak through.

```rust
pub struct NodeId(String);

impl NodeId {
    pub fn parse(raw: &str) -> Result<Self, AppError> {
        let re = regex::Regex::new(r"^[a-z0-9_-]{4,64}$").unwrap();
        if re.is_match(raw) {
            Ok(NodeId(raw.to_string()))
        } else {
            Err(AppError::InvalidInput(format!("Invalid NodeId: {}", raw)))
        }
    }
}
```

### 6.3 — Use `safe_join` for All File Paths Built from User Input

Never construct file paths by concatenating user-supplied strings. Use the `safe_join` utility in `fs.rs`, which rejects any path that escapes the base directory.

```rust
// ❌ Wrong — path traversal vulnerability
let path = base_dir.join(&user_input);

// ✅ Correct
let path = safe_join(&base_dir, &user_input)?;
```

### 6.4 — Sanitize All Markdown and LLM Output

Never use `dangerouslySetInnerHTML`. All Markdown and LLM output must be rendered through `react-markdown` with `rehype-sanitize`. In a Tauri app, XSS has elevated risk because the WebView runs with local file access.

```tsx
// ❌ Wrong — XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: markdownToHtml(llmOutput) }} />

// ✅ Correct
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const SAFE_SCHEMA = {
  ...defaultSchema,
  tagNames: ['p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3'],
  attributes: {}, // no attributes — strips href, onclick, etc.
};

<ReactMarkdown rehypePlugins={[[rehypeSanitize, SAFE_SCHEMA]]}>
  {llmOutput}
</ReactMarkdown>
```

Links in rendered output must open via `@tauri-apps/api/shell`'s `open()`, never via `<a href>` or `window.location`.

### 6.5 — Rate Limit Expensive IPC Operations

Embedding, LLM completion, document ingestion, and Memory Agent runs must all be rate-limited using the `governor` crate. If you're implementing one of these operations and there's no rate limiter present, add one.

### 6.6 — SQLite Security Pragmas

Every SQLite connection must be initialized with these pragmas before use:

```rust
conn.execute_batch("
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA trusted_schema = OFF;
    PRAGMA defensive = ON;
")?;
```

The database file must also be created with restricted permissions (`0o600`).

---

## 7. Frontend Standards

### 7.1 — TypeScript Strict Mode, No `any`

`tsconfig.json` enforces `strict`, `noImplicitAny`, and `noUncheckedIndexedAccess`. Use `unknown` and narrow the type, or define the correct type. If a Tauri response is untyped, cast it through a Zod schema or type guard.

### 7.2 — Component Rules

- Functional components only — no class components
- Co-locate component styles in `ComponentName.module.css` (unless sharing global design tokens)
- Keep components under 200 lines — extract hooks into `/ui/src/hooks/`
- No business logic in components — logic lives in hooks or services

### 7.3 — Service Layer Contract

Every file in `/ui/src/services/` must:

- Export only typed async functions (never raw `invoke`)
- Handle the `AppError` discriminated union explicitly
- Return `{ data: T } | { error: AppError }` — never throw

```typescript
// /ui/src/services/nodes.ts
export async function getNode(
  id: string
): Promise<{ data: Node } | { error: AppError }> {
  return ipc.invoke('node_get', { id });
}
```

---

## 8. AI / LLM Pipeline

### 8.1 — Prompt Assembly Checklist

Before any prompt is assembled and sent to an LLM (local or cloud), verify:

1. **Privacy filter runs first** — Locked / Local-Only nodes are stripped or stubbed
2. **Scope is user-approved** — never silently expand scope beyond what the user selected
3. **Token budget is enforced** — the assembler stops adding nodes when the budget is exhausted
4. **For cloud LLMs** — the assembled prompt is logged locally (redacted) for the audit trail

### 8.2 — Prompt Injection Prevention

When writing prompts for the document extraction pipeline, always use XML delimiter separation between system instructions and user content:

```
<system>
  [System instructions here]
</system>
<document>
  {raw_document_content — treated as DATA only, never as instructions}
</document>
```

Never concatenate system instructions and raw document content without structural separation.

### 8.3 — Vector Database

- Qdrant (preferred) or Chroma handles vector storage and ANN retrieval
- SQLite remains the **source of truth** for all relational / structured data
- Each vector payload must include: `keyword`, `summary`, `detail`, `decay_score`, `vault_id`, `privacy_tier`
- Privacy tier is enforced at retrieval time — Locked / Redacted nodes are filtered before results are returned

### 8.4 — LangGraph Session State

The Session State object (used for attention-guided pruning) is managed by LangGraph. It is **not** a flat chat history. It tracks which nodes were injected per turn, which were cited in the LLM response, and the current compression level per node. Session State is ephemeral — it lives in memory for the session lifetime and is never written to SQLite.

---

## 9. Testing

### 9.1 — Required Unit Tests (Rust)

Every Rust module must have unit tests covering:

- Newtype validation (valid inputs accepted, invalid rejected)
- `safe_join` path confinement (traversal attempts return `Err`)
- Privacy tier resolution (node → sub_vault → vault waterfall)
- SQL queries (use an in-memory SQLite database)
- Decay score computation (known inputs → expected output range)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_id_rejects_path_traversal() {
        assert!(NodeId::parse("../../etc/passwd").is_err());
        assert!(NodeId::parse("valid-node-id-001").is_ok());
    }

    #[test]
    fn safe_join_prevents_traversal() {
        let base = std::path::Path::new("/app/data");
        assert!(safe_join(base, "../../../etc/passwd").is_err());
        assert!(safe_join(base, "valid-export.json").is_ok());
    }
}
```

### 9.2 — What Doesn't Need Unit Tests

- React component rendering → use integration / e2e tests for UI
- Tauri command wiring → test the underlying functions, not the command handler
- Migration SQL files → verified by the migration runner integration test

---

## 10. Logging

- **Never** log any field named: `api_key`, `token`, `secret`, `password`, `key`, or `credential`
- Use structured logging (`tracing` crate in Rust) with named fields, not format strings
- Log levels: `error` for user-impacting failures · `warn` for recoverable issues · `debug` for dev only
- The cloud LLM audit log is a **database write**, not a log line

```rust
// ❌ Wrong — could accidentally expose secrets via Debug on a struct
tracing::debug!("Making LLM call with config: {:?}", config);

// ✅ Correct — explicit named fields only
tracing::debug!(provider = %provider, token_count = %count, "LLM call initiated");
```

---

## 11. Quick Reference

When you're implementing something and unsure which pattern to use:

| Task | Correct approach |
|---|---|
| Store a secret | OS keychain via `keyring` — never SQLite |
| Read a file from user input | `safe_join` — never raw `fs::read` |
| Build a SQL query | Parameterized `?1` — never `format!` |
| Render LLM or Markdown output | `react-markdown` + `rehype-sanitize` — never `dangerouslySetInnerHTML` |
| Call an LLM API | Rust makes the call — never JavaScript |
| Handle an error | `AppError` variant with `?` — never `unwrap()` |
| Expose data to the frontend from an LLM | Return `{ response, cited_nodes }` only — never the assembled prompt |

---

## Before committing (required)

Run the project preflight gate before committing. It’s cross-platform and matches CI.

### Windows (PowerShell) / macOS / Linux (bash)

```bash
# Auto-fix formatting + run full checks (recommended)
npm run preflight:fix

git add -A
git commit -m "your message"
```

Checks only (no auto-fixes):

```bash
npm run preflight
```
If your situation isn't covered here, open a discussion before implementing. It's much easier to course-correct a design than a merged PR.