# Obsidian Integrated

Workspace-scoped knowledge exchange between **Obsidian**, **Cursor IDE and its agent/CLI**, and **VS Code**. Vaults remain the source of truth; projects retrieve only their approved notes and write session knowledge to an explicit inbox.

**Status: tested development foundation, not a production release.** This repository includes a functioning local MCP server, a shared Cursor/VS Code extension, and a desktop Obsidian companion. Editor installation and real-vault end-to-end acceptance remain manual. Semantic/vector RAG, background synchronization, and a supported live Rhen API are roadmap work. No private Rhen source or personal vault notes are included.

## What is implemented

- Per-workspace profiles with multiple vaults, include/exclude globs, optional tag filters, read-only defaults and an explicit capture destination per vault.
- A machine-local vault registry managed from the extension's **Manage Vaults and Workspace** settings command. Workspace profiles reference vault IDs, not absolute vault locations. Changed profiles require renewed local approval.
- Shared retrieval: local BM25-style ranking, Markdown heading chunks, aliases, wiki/Markdown links, backlinks, one-hop graph expansion, revision hashes and line citations. Scope filters run before ranking and graph construction.
- MCP tools for status, search, reading, neighbors and idempotent create-only capture. The same server supports Cursor's IDE and CLI and other local MCP clients.
- A single VSIX codebase with runtime detection of Cursor's MCP registration API and VS Code's MCP provider API. Manual configuration export is available for CLI use.
- An Obsidian settings tab and commands for scoped browsing, native graph neighbors and selection capture.
- Conservative Rhen compatibility: deny known locked paths, skip sealed envelopes, reject unreadable installed policy, and never request keys or unlock notes.

## Start developing

Use Node.js **22.16+** and npm. From the repository root:

```sh
npm ci
npm run check
npm run demo
npm run package:extension
```

The demo creates and removes a synthetic temporary vault. It does not inspect your own vaults.

Build outputs:

| Output                          | Purpose                                                |
| ------------------------------- | ------------------------------------------------------ |
| `dist/obsidian-integrated.vsix` | Install from VSIX in Cursor or VS Code                 |
| `dist/mcp/server.mjs`           | Bundled standalone MCP server                          |
| `dist/obsidian-integrated/`     | Desktop Obsidian plugin: `main.js` and `manifest.json` |

In the editor, run **Obsidian Integrated: Manage Vaults and Workspace**. Register a vault, then configure its include/exclude patterns and optional existing capture folder for the current workspace. For a multi-root workspace, save the `.code-workspace` file first; one explicit profile controls the workspace as a whole. [Setup instructions](docs/SETUP.md) cover the CLI, Obsidian and project folders with different scopes.

## Layout

```text
apps/
  vscode-extension/     One editor extension for Cursor and VS Code
  obsidian-plugin/      Settings and native Obsidian graph integration
  mcp-server/           Agent/harness protocol adapter
packages/
  core/                 Contracts, profile validation, Markdown, graph and retrieval
  local-service/        Registry approvals, filesystem policy, retrieval and capture
  rhen-adapter/         Conservative disk-policy compatibility; no cryptography
docs/                   Architecture, source review, scope/RAG design and roadmap
examples/               Portable workspace and machine-registry templates
integrations/cursor/    Optional agent rule template
tests/                  Synthetic-vault policy and MCP tests
```

## Design and limits

See [architecture](docs/ARCHITECTURE.md), [workspace scoping](docs/WORKSPACE-SCOPING.md), [RAG strategy](docs/RAG.md), [Rhen compatibility](docs/RHEN.md), [documentation review](docs/RESEARCH.md), [roadmap](docs/ROADMAP.md), and [validation](docs/VALIDATION.md).

This preview uses fresh filesystem validation with an in-memory parse cache. It deliberately has no persistent plaintext/vector index. Notes returned to an AI client may be sent to that client's model provider; local indexing does not imply local inference. Scope enforcement applies to this integration, not to every other tool an agent may have.

Capture adds new Markdown notes with provenance. Existing-note updates, bidirectional conflict resolution, automatic full-session exports, attachments/OCR, remote workspaces and cloud agents are not implemented. Rhen folder unlock exceptions remain denied until there is an authenticated policy contract. Keep the vault out of the code workspace's ordinary indexing roots when using scoped MCP retrieval.

MIT licensed. Rhen Vault is a separate product and its source is not part of this repository.
