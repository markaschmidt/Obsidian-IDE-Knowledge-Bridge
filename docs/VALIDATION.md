# Validation record

Initial validation: 2026-10-10, Windows, Node.js 24.15.0, npm 11.12.1. GitHub Actions also passed typechecking, all 25 tests, builds and VSIX packaging with Node.js 22 on Windows, macOS and Linux. These checks do not exercise the actual editor or Obsidian user interfaces.

| Check                                                       | Result                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------- |
| TypeScript strict checking                                  | Passed                                                                |
| Unit / service / in-memory MCP tests                        | 24 passed                                                             |
| Bundled standalone MCP over stdio                           | 1 passed                                                              |
| MCP server, shared editor extension, Obsidian plugin builds | Passed                                                                |
| VSIX packaging and file listing                             | Passed; extension, bundled server, manifest, README, license          |
| Synthetic retrieval benchmark                               | Executed; results below                                               |
| Personal-vault testing                                      | Not performed                                                         |
| Cursor / VS Code extension-host UI                          | Not exercised in this environment                                     |
| Live Obsidian + Rhen installation                           | Not exercised; source-informed compatibility and synthetic tests only |
| Marketplace / Obsidian directory submission                 | Not performed                                                         |

The 25 tests cover path traversal, hidden/reserved paths, links/junctions, hard links, two-workspace isolation, unapproved profile edits, tag filtering, encrypted envelopes, legacy/missing/malformed Rhen policy, stale cache eviction, graph resolution, aliases, ambiguous paths, capture permissions, idempotency, conflict refusal and MCP request/response behavior.

The first restricted-shell attempt could not canonicalize its sandbox temporary directory. The full suite then ran with ordinary filesystem access against its own synthetic temporary directories. No private vaults were read or modified by the test suite.

## Baseline performance

`npm run benchmark` generated 202 in-scope synthetic notes (approximately 180 KB). One local run recorded:

- Cold query: 1,116 ms.
- Subsequent queries: 860, 851, 941, 922 and 934 ms.

These figures describe the initial full-validation implementation on this machine, not a production performance guarantee. Each query revalidates file contents and Rhen policy. A persistent incremental index is planned in [RAG.md](RAG.md); it must preserve revocation behavior before replacing this baseline.

## Required live acceptance

Install the built artifacts in disposable test environments and complete the matrix in [ROADMAP.md](ROADMAP.md). Verify native graph updates after capture, Cursor and VS Code registration APIs, CLI export, saved multi-root workspaces, workspace trust, multiple windows, and Rhen policy changes during active sessions. Run these checks before describing the integration as seamless or production ready.
