# Security Policy

Amber takes the security and privacy of user data incredibly seriously. 
As a local-first application designed to protect sensitive personal context, ensuring the integrity of our data layers, IPC bridge, and cryptographic locks is our top priority.

## Supported Versions

Amber is currently in active development. Security updates and patches are evaluated and applied exclusively to the latest version.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have found a security vulnerability in Amber such as an IPC bridge exploit, a bypass of the Redacted/Locked privacy tiers, or a local path traversal please report it directly to the maintainer.

### How to Report (Check first!)

1. **GitHub Private Vulnerability Reporting:** Navigate to the **Security** tab of this repository, click **Advisories**, and select **Report a vulnerability**. 
2. **[Discord Server](https://discord.gg/UYhqRHbH4M) Bug Report**: Alternatively, you can report to ask of your findings.

### What to Include

To help us resolve the issue as quickly as possible, please include:
* A detailed description of the vulnerability and its potential impact.
* Step-by-step instructions to reproduce the issue.
* The specific operating system and environment where the vulnerability was observed.
* Any relevant proof-of-concept code.

We will publicly acknowledge your contribution in the release notes once the patch is live (unless you prefer to remain anonymous).

## UI Privacy Enforcement

To ensure visual privacy and data sandboxing, the Amber user interface enforces strict visual boundaries around sensitive assets in both the spatial canvas and list-based navigation views.

1. **Redacted Data Isolation**:
   - Nodes and vaults marked as `redacted` hide their titles, summaries, breadcrumbs, search previews, active-memory rows, and connection labels until the master password is verified.
   - Redacted items are the most restrictive tier. The UI treats them as fully gated, omitting connectors and context previews wherever they would leak metadata before unlock.
   - When unlocked, the UI reveals the full metadata and content again.

2. **Locked Visual Waterwalls**:
   - Locked vaults, subvaults, and nodes remain readable at the metadata level, but their protected content surfaces are gated behind master-password prompts.
   - Locked items use muted neutral styling with dashed borders and lock badges, distinct from the stronger red/pink redacted treatment.
   - Locked items can still appear in navigation and context views, but their protected content stays blocked until unlocked.

3. **Privacy Cross-Vault Connectors**:
   - Any topological connection curves linking into or originating from a redacted target are omitted until unlock.
   - Locked connections can still render, but they inherit lock styling and respect the strictest effective privacy tier of the source and target chain.

4. **Privacy Inheritance**:
   - Privacy tiers cascade through nested vault hierarchies.
   - A redacted parent vault makes its children redacted in the UI and in backend context assembly unless the unlock flow has completed.
   - Any new UI that renders vault or node names should use the shared privacy helpers rather than reading raw fields directly.

