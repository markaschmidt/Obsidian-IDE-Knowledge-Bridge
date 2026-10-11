# Contributing

Use Node.js 22.16+ and `npm ci`. Run `npm run check` before submitting a pull request. Package changes also require `npm run package:extension` and inspection of the VSIX contents.

Open feature-branch pull requests against `staging` with a Conventional Commit title. A pull request into `main` has to come from `staging` and use a `promote:` title. Both the title check and the full test matrix have to pass before GitHub will merge.

Keep changes small enough to review against the workspace policy model. Add regression tests for scope or write behavior, especially cross-workspace access, Rhen policy changes and concurrent edits. Never test against personal vaults in CI.

Document user-visible behavior and remaining limitations. Host adapters should call the shared service instead of duplicating policy logic. Proposed Rhen interfaces need a versioned agreement; undocumented private methods are not an integration contract.
