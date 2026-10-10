# Validation record

Validation: 2026-10-10, Windows, Node.js 24.15.0, npm 11.12.1. Version 0.2 adds picker tests and isolated editor-host checks. The initial v0.1 foundation also passed all 25 tests, builds and VSIX packaging with Node.js 22 on Windows, macOS and Linux; each new push runs the same three-OS matrix.

| Check                                                       | Result                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| TypeScript strict checking                                  | Passed                                                                                |
| Unit / service / in-memory MCP tests                        | 48 passed                                                                             |
| Bundled standalone MCP over stdio                           | 1 passed                                                                              |
| MCP server, shared editor extension, Obsidian plugin builds | Passed                                                                                |
| VSIX packaging and file listing                             | Passed; extension, bundled server, shared slash skill, manifest, README, license      |
| Synthetic retrieval benchmark                               | Executed; results below                                                               |
| Personal-vault testing                                      | Not performed                                                                         |
| Cursor 3.23.12 / VS Code 1.118.1 extension host             | Isolated host smoke passed in both: activation, commands and slash-skill installation |
| Signed-in Agent chat and form rendering                     | Not exercised; protocol tested, actual chat appearance remains manual acceptance      |
| Dependency audit                                            | Zero known advisories after updating the VSIX packager to v4                          |
| Live Obsidian + Rhen installation                           | Not exercised; source-informed compatibility and synthetic tests only                 |
| Marketplace / Obsidian directory submission                 | Not performed                                                                         |

The 49 unit/service/protocol/process tests cover path traversal, hidden/reserved paths, links/junctions, hard links, two-workspace isolation, unapproved profile edits, tag filtering, encrypted envelopes, legacy/missing/malformed Rhen policy, stale cache eviction, graph resolution, aliases, ambiguous paths, capture permissions, idempotency, conflict refusal and MCP request/response behavior. Picker coverage includes singleton vault skipping, multiple-vault ordering, cancellation/decline, explicit selected-only resources, no-form fallback, legacy forms, paging/filtering, policy refresh between pages, per-invocation state, forged selections, limits, scope/root changes, locks/seals during selection, and truncation. Installer tests preserve existing skills and reject linked directories/files.

`scripts/host-smoke.ts` launches an installed editor with a disposable synthetic workspace, separate user-data/extensions directories and a preapproved synthetic profile. It verifies the actual extension activates, registers commands and installs the exact bundled slash skill. Both installed editors passed; Cursor reported its MCP API and VS Code reported its MCP provider API. Cursor's VS Code API version was 1.128.0. These checks do not sign in, invoke a model, visually inspect chat, or touch personal vaults. Run after building, with the editor executable path:

```sh
npx tsx scripts/host-smoke.ts /absolute/path/to/editor-executable
```

The first restricted-shell attempt could not canonicalize its sandbox temporary directory. The full suite then ran with ordinary filesystem access against its own synthetic temporary directories. No private vaults were read or modified by the test suite.

## Baseline performance

`npm run benchmark` generated 202 in-scope synthetic notes (approximately 180 KB). One local run recorded:

- Cold query: 1,116 ms.
- Subsequent queries: 860, 851, 941, 922 and 934 ms.

These figures describe the initial full-validation implementation on this machine, not a production performance guarantee. Each query revalidates file contents and Rhen policy. A persistent incremental index is planned in [RAG.md](RAG.md); it must preserve revocation behavior before replacing this baseline.

## Required live acceptance

Install the built artifacts in disposable test environments and complete the matrix in [ROADMAP.md](ROADMAP.md). Verify native graph updates after capture, Cursor and VS Code registration APIs, CLI export, saved multi-root workspaces, workspace trust, multiple windows, and Rhen policy changes during active sessions. Run these checks before describing the integration as seamless or production ready.
