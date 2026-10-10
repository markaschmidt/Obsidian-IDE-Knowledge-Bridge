# Obsidian IDE Knowledge Bridge

Workspace-scoped knowledge exchange between **Obsidian**, **Cursor IDE and its agent/CLI**, and **VS Code**. Vaults remain the source of truth; projects retrieve only their approved notes and write session knowledge to an explicit inbox.

**Status: v0.4 development preview.** This repository owns the Cursor/VS Code extension, shared chat UI and local MCP server. The Obsidian companion is independently maintained in [Knowledge Bridge](https://github.com/markaschmidt/KnowledgeBridge), and policy/retrieval in [Knowledge Bridge Core](https://github.com/markaschmidt/KnowledgeBridgeCore). The shared chip picker is browser-tested through the official MCP Apps SDK; signed-in chat rendering and real-vault end-to-end acceptance remain manual. Semantic/vector RAG, background synchronization, and a supported live Rhen API are roadmap work. No private Rhen source or personal vault notes are included.

## What is implemented

- `/obsidian` in Agent chat: submit the command, choose a scoped vault, then search documents and build removable chips. One shared MCP App supplies the controls in both editors; the same UI is available as an editor panel with **Copy for chat**. Optional native prompt autocomplete chains vault and document arguments; older clients retain forms. See [the chat workflow and limits](docs/CHAT.md).
- Per-workspace profiles with multiple vaults, include/exclude globs, optional tag filters, read-only defaults and an explicit capture destination per vault.
- A machine-local vault registry managed from the extension's **Manage Vaults and Workspace** settings command. Workspace profiles reference vault IDs, not absolute vault locations. Changed profiles require renewed local approval.
- Shared retrieval: local BM25-style ranking, Markdown heading chunks, aliases, wiki/Markdown links, backlinks, one-hop graph expansion, revision hashes and line citations. Scope filters run before ranking and graph construction.
- MCP tools for document selection, status, search, reading, neighbors and idempotent create-only capture. The same server supports Cursor's IDE and CLI and other local MCP clients.
- A single VSIX codebase with runtime detection of Cursor's MCP registration API and VS Code's MCP provider API. Manual configuration export is available for CLI use.
- Interoperability with the separately released Knowledge Bridge Obsidian companion through the same approved registry/profile contract.
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

| Output                                    | Purpose                                |
| ----------------------------------------- | -------------------------------------- |
| `dist/obsidian-ide-knowledge-bridge.vsix` | Install from VSIX in Cursor or VS Code |
| `dist/mcp/server.mjs`                     | Bundled standalone MCP server          |

In the editor, run **Obsidian IDE Knowledge Bridge: Manage Vaults and Workspace**. Register a vault, then configure its include/exclude patterns and optional existing capture folder for the current workspace. For a multi-root workspace, save the `.code-workspace` file first; one explicit profile controls the workspace as a whole. [Setup instructions](docs/SETUP.md) cover the CLI, Obsidian and project folders with different scopes.

## Layout

```text
apps/
  vscode-extension/     One editor extension for Cursor and VS Code
  mcp-server/           Agent/harness protocol adapter
  chat-ui/              Shared chip picker for MCP Apps and editor panels
docs/                   Architecture, source review, scope/RAG design and roadmap
examples/               Portable workspace and machine-registry templates
integrations/           Shared /obsidian skill and optional Cursor rule template
tests/                  Synthetic-vault policy and MCP tests
```

## Design and limits

See [architecture](docs/ARCHITECTURE.md), [workspace scoping](docs/WORKSPACE-SCOPING.md), [RAG strategy](docs/RAG.md), [Rhen compatibility](docs/RHEN.md), [documentation review](docs/RESEARCH.md), [roadmap](docs/ROADMAP.md), and [validation](docs/VALIDATION.md).

This preview uses fresh filesystem validation with an in-memory parse cache. It deliberately has no persistent plaintext/vector index. Notes returned to an AI client may be sent to that client's model provider; local indexing does not imply local inference. Scope enforcement applies to this integration, not to every other tool an agent may have.

Capture adds new Markdown notes with provenance. Existing-note updates, bidirectional conflict resolution, automatic full-session exports, attachments/OCR, remote workspaces and cloud agents are not implemented. Rhen folder unlock exceptions remain denied until there is an authenticated policy contract. Keep the vault out of the code workspace's ordinary indexing roots when using scoped MCP retrieval.

MIT licensed. Rhen Vault is a separate product and its source is not part of this repository.

## Independent updates and existing installations

See [RELEASING.md](RELEASING.md). This repository has a separate remote and release artifact from the Obsidian companion and core. The shared engine is pinned to a commit archive with a lockfile integrity hash and bundled into the VSIX/server. Builds do not read sibling repositories. Keep `composer.html` beside `server.mjs` when moving the standalone MCP bundle.

The display title is **Obsidian IDE Knowledge Bridge**. Extension ID `markaschmidt.obsidian-integrated`, command/configuration IDs, storage paths and `/obsidian` remain compatible with v0.3. Installing the updated VSIX upgrades the existing extension. Run **Enable /obsidian in This Workspace** to update an unmodified shipped skill; edited skills remain intact. The GitHub repository was renamed from Obsidian-Integrated with its history preserved.
