# Workspace scoping

## Three independent objects

1. **Vault registration:** machine-local ID, display name, canonical root and Rhen detection mode. This is maintained in the extension's vault-management UI.
2. **Workspace profile:** portable workspace ID, scopes, capture folders and retrieval budgets. Default path is `.obsidian-integrated/workspace.json`.
3. **Local approval:** hash of the normalized profile, keyed by its canonical absolute filename, in the private machine registry. Editing the profile revokes access until reviewed again. Copying a profile into another repository does not copy approval.

A vault is not automatically accessible because it was registered. It must also be present in the current approved profile. Including a vault in Project A does not include it in Project B. There is no implicit union of open windows, folders, recently used vaults or global MCP roots.

## Scope model

Each vault occurs once per profile. Its scope has a nonempty positive `include` list, optional `exclude` list and optional `tagsAny` filter. Path matching is case-insensitive for conservative cross-platform behavior. Exclusions win. Hidden paths, non-Markdown files, linked paths, protected notes and notes outside the tag filter are unavailable. A tag never overrides a path exclusion or Rhen denial.

`captureFolder` enables creation inside an existing folder. Optional `write: { "update": true, "delete": false }` independently enables reviewed edits or recoverable deletion within the same readable scope. Omitting both fields means read-only. Existing profiles keep their old approval hashes because write grants are optional with no implicit default keys. Both current and proposed text must satisfy tag filters. Legacy captures add the first required tag automatically; reviewed drafts preserve the user-provided Markdown. See [bidirectional notes](WRITES.md).

```json
{
  "version": 1,
  "workspaceId": "project-alpha",
  "name": "Project Alpha",
  "scopes": [
    {
      "vaultId": "research",
      "include": ["Projects/Alpha/**/*.md", "Shared/Engineering/**/*.md"],
      "exclude": ["**/Private/**"],
      "tagsAny": [],
      "captureFolder": "Projects/Alpha/Inbox"
    }
  ],
  "retrieval": { "maxResults": 8, "maxChars": 12000, "graphHops": 1 }
}
```

Two projects can intentionally share the same read-only reference folder while writing to different inboxes. The graph is built from the approved document set, so excluded nodes cannot enter through backlinks, aliases or neighbor expansion. References to excluded notes may still appear literally in an allowed note's body; scope filtering is not automatic redaction of prose authored in an allowed note.

## Editor workspace semantics

| Editor state                             | Profile anchor                         | Behavior                                    |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------- |
| One local folder                         | Folder root                            | One profile and MCP process                 |
| Saved multi-root workspace               | Directory containing `.code-workspace` | One explicit profile for the workspace      |
| Unsaved multi-root workspace             | None                                   | Save the workspace before connecting vaults |
| Untrusted workspace                      | None                                   | Extension vault features disabled           |
| SSH, WSL, container or virtual workspace | None in this preview                   | Requires a future explicit local bridge     |

Do not silently pick the first folder in a multi-root workspace. If folders require different knowledge boundaries, use separate windows/workspaces now. A future named project selector can bind each request to one folder/profile; it must not merge permissions.

The `obsidianIntegrated.profile` setting has window scope. Store a different relative profile path in each saved workspace when multiple `.code-workspace` files share a directory. For CLI sessions, export the desired profile's exact configuration. Extension registration alone is not a CLI configuration.

## Sharing and portability

The default `.obsidian-integrated/` directory is ignored to avoid accidentally publishing local project scopes. To share a sanitized profile intentionally, store it at a tracked path such as `config/knowledge-profile.json` and set the workspace profile setting accordingly. Machine catalogs, approvals and personal captures do not belong in Git. Each developer maps the logical vault IDs to their own roots and approves the profile locally.

Removing a vault registration makes its profiles invalid immediately on the next operation. The settings command also clears approvals. Changes during retrieval cause failure and cache eviction; no partially authorized snapshot is returned.
