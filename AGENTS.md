# Amber Project Rules for Jules

## Architecture Summary
- This is a desktop application built with Tauri.
- Backend: Rust (`core/src/`), using an embedded SQLite database (`db/migrations/`).
- Frontend: React + TypeScript + Vite (`ui/`).

## Operational Commands
- To install frontend dependencies: `npm install`
- To check formatting/linting: `npm run lint` or `cargo fmt --all`

## Rules for Code Generation
1. Separation of Concerns: Never invoke database logic directly from React components. All database access or local LLM context handling must go through a command handler in Rust (`core/src/`), which is then invoked via the strongly typed TS services in `ui/services/`.
2. Privacy Protocols: Ensure all modifications handling personal user data respect the encryption structures in `core/src/privacy.rs` and `core/src/redacted.rs`.
