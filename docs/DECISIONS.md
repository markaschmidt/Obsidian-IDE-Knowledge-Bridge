# Architecture decisions

| Decision                                           | Rationale                                                                                  | Revisit when                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| One TypeScript monorepo                            | Obsidian and VS Code both use TypeScript; policy and retrieval must not drift across hosts | A measured bottleneck justifies a native worker               |
| One shared VSIX for Cursor and VS Code             | Stable common editor APIs plus small capability-detected host adapters                     | Host extension APIs diverge                                   |
| MCP for agent/harness access                       | Public portable tool boundary supports editor and CLI workflows                            | A client requires additional authenticated transport          |
| Private registry plus portable workspace profile   | Machine paths stay private while project intent can be shared                              | A managed team policy service is added                        |
| One server/profile, no tool-level profile override | Prevent accidental cross-project context pooling                                           | Explicit project selector has been designed and audited       |
| No implicit vault-to-workspace auto-binding        | Foreground windows, cwd and note links are unreliable authorization signals                | User-controlled pairing and workspace identity are durable    |
| Read-only default; create-only capture             | Useful two-way knowledge transfer without overwriting concurrent human edits               | Revisioned write transactions and conflict UI exist           |
| Scoped lexical + graph baseline                    | Transparent, offline, testable retrieval before adding model dependencies                  | Hybrid retrieval improves the measured evaluation set         |
| No persistent index yet                            | Avoid stale protected plaintext while Rhen lacks a live policy contract                    | Revocation, eviction and storage policy have acceptance tests |
| Conservative Rhen adapter                          | User-visible unlock does not authorize AI export; no private API contract is assumed       | A supported versioned policy API is available                 |
| No chat database scraping                          | Host private stores are brittle and may contain unrelated sessions                         | A supported scoped session export API exists                  |
| Local desktop first                                | Remote execution changes filesystem authority and confidentiality                          | Authenticated bridge and pairing are implemented              |

Each decision describes the current foundation. It is not a claim that the future work is already implemented.
