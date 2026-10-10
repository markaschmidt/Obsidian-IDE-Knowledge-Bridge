# Implementation roadmap

## Phase 0 — foundation (implemented)

Shared TypeScript workspace, strict config schemas, private vault registry, approval hashing, scoped lexical/graph retrieval, Rhen disk-policy checks, create-only capture, MCP adapter, shared editor adapter, Obsidian settings/native graph companion, synthetic tests, standalone stdio test and three-OS CI configuration.

Definition of done for this phase: typecheck, policy tests, built MCP round trip and installable development artifacts. Host UI and real-vault workflows still require the acceptance checks below.

Version 0.2 adds the shared `/obsidian` workspace skill, in-chat MCP vault/document forms, scoped selected-resource output, revision revalidation, and a native clipboard fallback. Protocol and synthetic-vault tests cover selection and cancellation; the host still controls rendering and agent invocation. See [CHAT.md](CHAT.md).

## Phase 1 — host acceptance and settings UX

Version 0.3 implements one chip UI for MCP Apps and editor panels, plus optional dependent MCP prompt arguments. Synthetic browser checks exercise selection and the official Apps bridge; isolated editor-host checks cover webview startup. Signed-in chat invocation, host framing and message delivery still require acceptance in each product. The builder opens after slash-command submission; custom native input-composer tokens are not claimed.

Install the VSIX in current Cursor and VS Code and the companion in a disposable Obsidian vault. Test every command, MCP registration/unregistration, reload, changed settings, multiple windows, multi-root profiles and disabled trust. Record exact host versions. Add extension-host automation and an Obsidian harness where feasible.

Build a native settings view for vaults, project bindings, scope previews, denied reasons, read/write capabilities and index health. Show which workspace is connected in each host. Preserve the portable profile / private catalog split. Add a selected-profile picker to the Obsidian companion and an explicit pairing action from the editor. Decide whether future vault registration in Obsidian writes the shared catalog via a single coordinator.

## Phase 2 — incremental hybrid RAG

Implement the storage/indexing plan in [RAG.md](RAG.md), including event reconciliation, chunk revisioning, local embeddings, strict candidate prefiltering, vector migrations and retrieval evaluations. Persistent caches need retention, deletion and Rhen revocation behavior before enabling them by default. Benchmark representative vaults and publish hardware/dataset details.

## Phase 3 — Rhen live contract

Agree a supported policy API with Rhen's maintainer. Version and test the contract separately from private implementation details. Implement policy events and verified unlock exceptions. Test custom config directories, legacy IDs and protected-account vaults; inaccessible vaults must remain inaccessible. No default plaintext export of protected notes.

## Phase 4 — richer two-way knowledge lifecycle

Add draft/review/commit workflows for decisions, tasks, code references and session handoffs. Preserve provenance: workspace ID, source tool/session, original note/chunk revisions, relevant repository/commit and timestamps. Automatically record code-location provenance only with a documented redaction policy.

Existing-note edits require expected-content hashes, a human-reviewable diff, one writer per vault, atomic commit through native APIs, conflict copies, retries and durable idempotency. Never overwrite concurrent human edits. Rename/move must preserve stable note identity and graph edges; deletions require an explicit product workflow. Test Obsidian Sync/Git sync conflicts rather than assuming local atomic writes solve multi-device synchronization.

Optional Cursor hooks can propose a handoff after an assistant response or session end. Define consent, retention, size caps, project binding, deduplication and redaction first. Do not record raw transcripts, passwords or hidden reasoning. Capture must stay optional and destination-bound. VS Code must retain equivalent explicit commands even without Cursor-specific hooks.

## Phase 5 — cross-functional formats and distribution

Add plugin interfaces for Canvas, attachments/PDF/OCR, tasks, frontmatter properties, code symbols and external references. Preserve format-specific access rules and citations. Attachments protected by Rhen must not enter OCR/extraction pipelines. External fetches require separate scope; a URL in a note is not authorization.

Package reproducible Obsidian releases and VSIX artifacts, include dependency notices, implement signed/versioned migrations, and decide Marketplace/Open VSX publishing separately. No Marketplace publisher identity is registered by this scaffold. Add telemetry only through an explicit opt-in, without note bodies or file paths.

Remote environments, containers, mobile Obsidian, cloud agents and multiple machines require an authenticated relay/pairing design. A localhost URL alone is not authentication. Do not forward local filesystem roots or a whole vault to cloud agents automatically.

## Acceptance matrix

| Workflow                               | Automated foundation                                                        | Host acceptance still required                        |
| -------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/obsidian` vault / document selection | Shared UI, Apps bridge, forms, stdio and real editor webview startup tested | Signed-in chat skill invocation, framing and delivery |
| Scoped vault search / read / graph     | Yes                                                                         | Cursor, VS Code and Obsidian UI                       |
| New note capture / retry / conflict    | Yes                                                                         | Obsidian file detection and live sync                 |
| Cursor agent + CLI MCP                 | Protocol/process tested                                                     | Actual agent/tool selection and exported config       |
| VS Code MCP provider                   | Compiled                                                                    | Installed host registration and approval UX           |
| Multi-root workspace                   | Specified and implemented                                                   | Multiple saved workspaces and windows                 |
| Rhen lock, envelope, malformed policy  | Synthetic tests                                                             | Joint live plugin tests and races                     |
| Semantic RAG / persistent index        | No                                                                          | Planned                                               |
| In-place note updates / merge          | No                                                                          | Planned                                               |
| Background session hooks               | No                                                                          | Planned opt-in                                        |
