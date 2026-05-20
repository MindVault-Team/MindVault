# Security Policy

MindVault takes the security and privacy of user data incredibly seriously. 
As a local-first application designed to protect sensitive personal context, ensuring the integrity of our data layers, IPC bridge, and cryptographic locks is our top priority.

## Supported Versions

MindVault is currently in active development. Security updates and patches are evaluated and applied exclusively to the latest version.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you believe you have found a security vulnerability in MindVault such as an IPC bridge exploit, a bypass of the Redacted/Locked privacy tiers, or a local path traversal please report it directly to the maintainer.

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

To ensure visual privacy and data sandboxing, the MindVault user interface enforces strict visual boundaries around sensitive assets in both the spatial canvas and layout nodes:

1. **Redacted Data Isolation**:
   - Nodes marked as "Redacted" have their titles and content completely replaced by the static string `[REDACTED]` at the application boundary.
   - Redacted nodes are fully non-interactive. The UI disables all hover events, selection clicks, context menus, and inline editing for these items.

2. **Locked Visual Waterwalls**:
   - Locked vaults, subvaults, and nodes display desaturated locked badges and use distinct dashed borders (`border-style: dashed`) to visually isolate them from public/unlocked data.
   - Access to details or internal nodes of a Locked vault is fully blocked until unlocked by the user.

3. **Privacy Cross-Vault Connectors**:
   - Any topological connection curves (SVG pathways) linking into or originating from a Locked or Redacted node automatically inherit the most restrictive privacy tier.
   - These connection curves are rendered as dashed visual lines containing explicit desaturated Lock SVG indicators overlaying the path.

