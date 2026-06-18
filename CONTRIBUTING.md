# Contributing to Amber

First off, thank you for considering contributing to Amber! 

Amber is built on the philosophy that human memory and AI context should be entirely local, private, and owned by the user. By contributing, you are helping build a powerful, secure, and sovereign tool for thought.

This document outlines the process for contributing, reporting bugs, and proposing new features.

## Table of Contents
1. [Project Architecture](#project-architecture)
2. [Development Setup](#development-setup)
3. [How to Contribute](#how-to-contribute)
4. [Development Guidelines](#development-guidelines)
5. [Pull Request Process](#pull-request-process)

---

## Project Architecture

Amber is a Tauri application built with a strict separation of concerns. Please read our `ARCHITECTURE.md` for deep dives, but the core split is:

* **`/core` (The Backend):** Written in Rust. Handles all SQLite database interactions (`rusqlite`), cryptographic security (Argon2id), file system operations, and future local LLM orchestration.
* **`/ui` (The Frontend):** Written in React + TypeScript (Vite). Handles the visual interface, state management, and user interactions.
* **The IPC Bridge:** The frontend and backend communicate *exclusively* through typed Tauri commands. The database is never accessed directly from the frontend.

---

## Development Setup

To get your local environment running, you will need Node.js (24+) and the stable Rust toolchain.

```bash
# 1. Install frontend dependencies
npm ci

# 2. Run the full desktop application in development mode
npm run tauri dev
```

For a detailed breakdown of testing and linting commands, please refer to the `README.md`.

---

## How to Contribute

### Reporting Bugs
If you find a bug, please search the existing issues or ask in the [Discord Server](https://discord.gg/UYhqRHbH4M) first to avoid duplicates. If the issue is new, open a **Bug Report** and include:
* Your OS and environment details.
* Clear, step-by-step instructions to reproduce the bug.
* Expected vs. actual behavior.
* Screenshots or console logs if applicable.

**🔒 Security Vulnerabilities:** If you find a security flaw (e.g., a way to bypass the Redacted privacy tier or an IPC exploit), **DO NOT open a public issue**. Please refer to our `SECURITY.md` for instructions on private reporting.

---

## Development Guidelines

To ensure the codebase remains fast, secure, and maintainable, please adhere to the following rules:

### Rust / Backend (`/core`)
* **Synchronous SQLite:** We use synchronous `rusqlite` wrapped in Tauri's async commands to avoid locking issues.
* **Strict Parameter Binding:** All database queries *must* use strict positional parameters (e.g., `?1`, `?2`) to prevent SQL injection.
* **IPC Types:** Any data structure passed to the frontend must be defined in `ipc_types.rs` with `ts-rs` macros to auto-generate TypeScript definitions.
* **Format & Lint:** Use the preflight gate below before committing.

### React / Frontend (`/ui`)
* **TypeScript:** Strict TypeScript is enforced. Do not use `any` types. Ensure all backend responses are strongly typed using the generated interfaces.
* **Styling:** We use standard CSS (`App.css`). **Do not use inline styles.** Adhere to the established dark, minimalist aesthetic.
* **State Management:** Keep state as localized as possible. Only lift state globally (e.g., `App.tsx`) when absolutely necessary (like the `isRedactedUnlocked` auth state).
* **Linting:** Ensure your code passes `npm run lint` and `npx tsc --noEmit` before opening a PR.

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

---

## Pull Request Process

1. **Fork & Branch:** Fork the repository and create a new branch from `main` (e.g., `feature/awesome-new-tag-ui` or `fix/sqlite-routing-bug`).
2. **Commit Often:** Write clear, concise commit messages detailing *why* a change was made.
3. **Atomic Changes:** Keep pull requests focused on a single issue or feature. Do not mix unrelated refactors with feature additions.
4. **Pass CI:** Ensure GitHub Actions pass (linting, type-checking, and Rust tests).
5. **Review:** Open the PR and request a review. Be prepared to iterate based on feedback!

By contributing to Amber, you agree that your contributions will be licensed under its AGPLv3 License.
