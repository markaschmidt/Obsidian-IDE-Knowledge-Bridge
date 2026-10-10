# Validation record

Validation: 2026-10-10, Windows, Node.js 24.15.0, npm 11.12.1. Version 0.3 adds the shared chip UI, browser SDK tests and real webview startup checks. Each push runs the Node.js 22 Windows/macOS/Linux matrix; Linux also runs the browser tests.

| Check                                                       | Result                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| TypeScript strict checking                                  | Passed                                                                                    |
| Unit / service / in-memory MCP tests                        | 54 passed                                                                                 |
| Bundled standalone MCP over stdio                           | 1 passed                                                                                  |
| Shared picker browser tests                                 | 2 passed: editor bridge and official MCP Apps iframe transport                            |
| MCP server, shared editor extension, Obsidian plugin builds | Passed                                                                                    |
| VSIX packaging and file listing                             | Extension, server, shared composer HTML, slash skill, manifest, README and license        |
| Synthetic retrieval benchmark                               | Executed; results below                                                                   |
| Personal-vault testing                                      | Not performed                                                                             |
| Cursor 3.23.12 / VS Code 1.118.1 extension host             | Passed in both: activation, commands, slash skill and actual shared webview startup       |
| Signed-in Agent chat embedding and delivery                 | Not exercised; actual host framing, skill invocation and message acceptance remain manual |
| Dependency audit                                            | Zero known advisories after updating the VSIX packager to v4                              |
| Live Obsidian + Rhen installation                           | Not exercised; source-informed compatibility and synthetic tests only                     |
| Marketplace / Obsidian directory submission                 | Not performed                                                                             |

The 57 automated tests cover path traversal, hidden/reserved paths, links/junctions, hard links, workspace isolation, unapproved profile edits, tags, encrypted envelopes, legacy/missing/malformed Rhen policy, cache eviction, graph resolution, aliases, ambiguous paths, capture permissions, idempotency, conflict refusal and MCP behavior. Selection coverage includes vault ordering, cancellation, selected-only output, no-form fallback, legacy forms, paging/filtering, policy refresh, forged selections, limits, scope/root changes, locks/seals during selection, and truncation.

Version 0.3 additionally checks session isolation/expiry, first-offered revisions, app-only metadata, dependent prompt arguments, real browser chips, vault changes, cancellation, clipboard delivery and rejected chat delivery followed by retry. The compiled stdio test reads the actual packaged HTML resource. Installer tests migrate an unmodified shipped v0.2 skill while preserving user edits and rejecting linked directories/files.

`scripts/host-smoke.ts` launches an installed editor with a disposable synthetic workspace, separate user-data/extensions directories and a preapproved synthetic profile. It verifies activation, commands, the bundled slash skill and the shared context builder's browser startup handshake. Both installed editors passed on v0.3.0; Cursor reported its MCP API and VS Code its MCP provider API. Cursor's VS Code API version was 1.128.0. These checks do not sign in, invoke a model, inspect chat, or touch personal vaults. Run after building, with the editor executable path:

```sh
npx tsx scripts/host-smoke.ts /absolute/path/to/editor-executable
```

The first restricted-shell attempt could not canonicalize its sandbox temporary directory. The full suite then ran with ordinary filesystem access against its own synthetic temporary directories. No private vaults were read or modified by the test suite.

Run `npm run test:ui` after building. Windows uses installed Edge; other platforms require `npx playwright install chromium` first. The two browser tests exercise both UI bridges with synthetic notes. Generated screenshots in `dist/` were visually inspected locally; they are test previews, not screenshots of signed-in chat.

## Baseline performance

`npm run benchmark` generated 202 in-scope synthetic notes (approximately 180 KB). One local run recorded:

- Cold query: 1,116 ms.
- Subsequent queries: 860, 851, 941, 922 and 934 ms.

These figures describe the initial full-validation implementation on this machine, not a production performance guarantee. Each query revalidates file contents and Rhen policy. A persistent incremental index is planned in [RAG.md](RAG.md); it must preserve revocation behavior before replacing this baseline.

## Required live acceptance

Install the built artifacts in disposable test environments and complete the matrix in [ROADMAP.md](ROADMAP.md). Verify native graph updates after capture, Cursor and VS Code registration APIs, CLI export, saved multi-root workspaces, workspace trust, multiple windows, and Rhen policy changes during active sessions. Run these checks before describing the integration as seamless or production ready.
