---
name: knowledge-bridge-release
description: >-
  Promote Obsidian IDE Knowledge Bridge from feature branches through staging
  to main, including pull request titles, required checks, version bumps, and
  branch rules. Use when changing release CI, opening a promotion pull request,
  bumping the extension version, or working in
  markaschmidt/Obsidian-IDE-Knowledge-Bridge.
---

# Knowledge Bridge release

Repository: `markaschmidt/Obsidian-IDE-Knowledge-Bridge` (this `ide-extension` checkout). `main` and `staging` reject direct pushes. Land changes only through the pull requests below.

## Feature to staging

Open the pull request against `staging`. Title must be a Conventional Commit:

`feat: add workspace search`
`fix(chat): keep the selected vault`
`feat!: replace the profile schema`

GitHub squash-merges it after all of these checks pass: `Test (ubuntu-latest)`, `Test (windows-latest)`, `Test (macos-latest)`, `PR title`. A valid title enables auto-merge. The squash commit subject is the pull request title, and that subject drives the later version bump.

## Staging to main

The pull request must come from `staging`. Title must start with `promote: `. The extra required check is `Staging branch`. Merge with a merge commit. Squash and rebase into `main` are disabled.

That merge bumps the version from the commits that reached `staging`:

- `type!:` or a body containing `BREAKING CHANGE` raises the major version
- `feat` raises the minor version
- every other promotion raises the patch version

It then tags that version with no `v` prefix, publishes the VSIX, and creates the GitHub release. Read [knowledge-bridge-marketplace](../knowledge-bridge-marketplace/SKILL.md) before publishing.

Add `[skip release]` to a `promote:` title only when the merge must not bump or publish. Use it for release-automation changes. Do not use it to hide a product change.

## Release job constraints

The job runs on a push to `main` whose message starts with `promote:` and does not contain `[skip release]`. The commit must be a merge whose second parent is contained in `origin/staging`.

Keep these versions identical: root `package.json`, `apps/vscode-extension/package.json`, `apps/mcp-server/package.json`, and the owned `package-lock.json` blocks. Do not change dependency versions such as `@knowledge-bridge/core` while bumping.

The `marketplace-release` deploy key is the only actor allowed to push onto `main`, and only for that version commit and tag. Do not add a bypass for people. Ruleset source is `.github/rulesets/`. Reapply with `node scripts/apply-branch-rules.mjs`.

Tokens live in the GitHub environment `marketplace`, limited to the `main` branch: `VSCE_PAT`, `OVSX_PAT`, and `RELEASE_DEPLOY_KEY`. Never commit them.
