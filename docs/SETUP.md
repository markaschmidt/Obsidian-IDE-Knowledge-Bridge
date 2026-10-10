# Setup and development

## Build and install the editor extension

```sh
npm ci
npm run check
npm run package:extension
```

In Cursor or VS Code choose **Extensions → Install from VSIX** and select `dist/obsidian-integrated.vsix`. The package is a development preview, not a Marketplace release. Install the same VSIX in either editor. Node.js 22.16+ must be available on PATH, or set the machine-level `obsidianIntegrated.nodePath` to its executable.

To debug from source, open this repository and use the supplied **Run Obsidian Integrated** launch configuration (F5). It builds the extension and launches a development host.

## Configure a workspace

1. Open and trust the local code workspace. Save multi-folder workspaces as a `.code-workspace` file.
2. Run **Obsidian Integrated: Manage Vaults and Workspace → Register a vault**. Choose a vault root, a portable ID and a display name. Select **Require Rhen policy** when that vault is expected to use Rhen.
3. Run **Configure a vault for this workspace**. Select include globs such as `Projects/Alpha/**/*.md`, exclusions and optional tags.
4. Leave capture folder blank for read-only access, or select an existing vault-relative inbox inside the included scope. Create that folder in Obsidian first if needed.
5. The native configuration flow saves and approves the chosen scope. Editing the JSON later requires **Review and approve workspace profile**.
6. Run **Search Workspace Knowledge** to inspect retrieved notes. Select editor text and run **Capture Selection to Vault** to save an explicit handoff.

The command is the plugin's vault-management settings surface. The standard **Obsidian Integrated** settings section contains the workspace profile location and machine Node path. No vault directory is stored in project settings.

On supported hosts, the extension registers the MCP server automatically after a valid approval. Check Cursor's MCP settings or VS Code's MCP server list. If the host version has neither supported registration API, export a configuration and add it manually.

## Cursor CLI / other MCP clients

Run **Export Cursor CLI Configuration** from the configured workspace. The command opens an unsaved JSON document with the current registry/profile and bundled server arguments. Merge its named server into the project's `.cursor/mcp.json` without replacing other servers. That file contains machine-specific paths: keep it local. When an IDE already has the extension-registered server, disable one registration if the manual file produces a duplicate.

The CLI must launch the same explicit profile. Do not infer authorization from a process's current directory. A generic launch is:

```sh
node /path/to/Obsidian-Integrated/dist/mcp/server.mjs --registry /private/path/vaults.json --profile /project/.obsidian-integrated/workspace.json
```

On Windows use absolute paths in JSON argument arrays so spaces do not require shell quoting. `examples/cursor.mcp.example.json` and `examples/vscode.mcp.example.json` show the different host formats. Replace all placeholders. For a CLI-only setup, create the registry/profile from the examples and use the small `scripts/approve-profile.ts` helper after reviewing the profile. It writes approval only to the named registry:

```sh
npx tsx scripts/approve-profile.ts /private/path/vaults.json /project/workspace.json
```

Optional agent guidance lives in `integrations/cursor/rules/knowledge.mdc`. Copy it into a project's `.cursor/rules` after MCP is configured. It contains no vault content and grants no additional permissions. This repository does not install session hooks or read private chat databases.

## Obsidian companion

Copy the contents of `dist/obsidian-integrated/` into the chosen vault's `.obsidian/plugins/obsidian-integrated/`, enable community plugins, then enable **Obsidian Integrated**. This is a desktop plugin. Do this manually in a test vault first.

In its settings, enter the private registry path and approved workspace profile path shown by **Show registry location** in the editor extension. Click **Check**. The registry must contain this vault's canonical root. The active profile can cover other vaults, but browsing/native graph commands in this Obsidian window only show notes from its own vault.

Commands:

- **Browse active workspace knowledge**: fuzzy-select authorized notes.
- **Show scoped native graph links**: incoming/outgoing neighbors from Obsidian's metadata cache, intersected with the approved set.
- **Capture selection to workspace inbox**: export only a selection whose source note is approved and readable from disk; sealed/Rhen-denied source notes are refused.

Choose a different profile in companion settings when switching projects. There is no automatic assumption that the last active Cursor window owns the Obsidian window. Automatic pairing is future work.

## Troubleshooting

| Symptom                      | Action                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Profile changed / unapproved | Review the profile, then approve it from extension settings                                                 |
| No results                   | Check include/exclude globs, tags and Rhen state; then try an exact identifier                              |
| Rhen policy unavailable      | Confirm the current plugin ID/layout and valid settings; never disable protection to make retrieval succeed |
| Capture denied               | Ensure the existing capture folder is included, not excluded, and not locked                                |
| Required Node not found      | Set the machine `nodePath`; do not put executable paths in shared profiles                                  |
| Multi-root setup refused     | Save the `.code-workspace` file, or open separate windows                                                   |
| Remote/WSL workspace refused | Use a local workspace in this preview                                                                       |
| Canonical path changed       | Re-register a moved vault; symbolic links/junctions are intentionally unavailable                           |

No real vault is configured by the repository's build, demo, tests or installer packaging. A first live acceptance test should use a disposable synthetic vault before connecting personal notes.
