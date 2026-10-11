# Independent releases

This repository owns **Obsidian IDE Knowledge Bridge** and version 0.5.0. It is one of three sibling repositories under `ObsidianLiths/KnowledgeBridge`: `obsidian-plugin`, `ide-extension` and `core`. Each has its own origin, main branch, CI and version tags. The ObsidianLiths hub records their commit pointers; it does not combine their histories.

The shared core is an immutable commit-pinned archive dependency bundled into each consumer. Editing the core checkout never changes an installed consumer. Adopt a new core commit explicitly, regenerate the consumer lockfile, run its tests and make a separate consumer release. Keep schema version 1 compatibility or introduce an explicit migration before changing registry/profile contracts.

Release tags equal the package version, for example `0.4.0`. Push a version tag only after reviewing changes and running checks. The release workflow verifies the tag, checks all three operating systems and uploads that repository's artifact. The Obsidian plugin also requires matching manifest and versions.json entries. Do not reuse tags.

The editor extension retains `markaschmidt.obsidian-integrated`, its command/configuration IDs and local storage location. The companion retains plugin ID `obsidian-integrated` and its saved settings. These compatibility IDs are intentional; visible titles are Knowledge Bridge and Obsidian IDE Knowledge Bridge. Existing scopes and approvals require no rename or broadening.

Feature branches merge into `staging` through a pull request. The title has to be a Conventional Commit, such as `feat: add workspace search` or `fix(chat): keep the selected vault`. GitHub merges it only after that title check and the Ubuntu, Windows, and macOS test jobs all succeed. Direct pushes to `staging` and `main` are rejected.

`staging` is the only branch that can merge into `main`. That pull request title starts with `promote: `. The merge bumps the version from the commits that reached `staging` (`feat` raises the minor version, a breaking change raises the major version, and every other promotion raises the patch version), tags that version, and publishes the same VSIX to the Visual Studio Marketplace and to Open VSX. Cursor searches Open VSX, so both publications are required. The GitHub release is created from that tag.

Include `[skip release]` in a `promote:` title only when a promotion must merge without publishing. Marketplace tokens stay in the GitHub `marketplace` environment as `VSCE_PAT` and `OVSX_PAT`. The Obsidian companion is still installed from its GitHub release assets, not from these extension registries.
