# Obsidian Integrated

A development preview for scoped knowledge sharing with Obsidian in Cursor and VS Code.

Run **Obsidian Integrated: Manage Vaults and Workspace** to register vaults and configure a workspace profile. Use **Search Workspace Knowledge** to retrieve notes and **Capture Selection to Vault** to save selected text into an approved inbox.

After configuration, submit **`/obsidian`** in Agent chat. The shared context builder presents the command, a scoped vault, and removable document chips. Search titles or paths, check documents, then press **Add to chat**. The same MCP App supplies these controls in Cursor and VS Code after submission. Only selected documents are delivered, subject to the workspace budget and a fresh access check. Existing profiles can use **Enable /obsidian in This Workspace**; unmodified v0.2 skills upgrade automatically.

**Open Obsidian Context Builder** opens the same controls in an editor panel, with **Copy for chat** for manual pasting. Older clients retain chat forms and **Copy Documents for Chat** native pickers. Native MCP prompt arguments also support dependent vault/document suggestions for one document. No private chat database or undocumented composer API is used. See the [chat workflow](https://github.com/markaschmidt/Obsidian-Integrated/blob/main/docs/CHAT.md) for supported behavior and signed-in host acceptance limits.

Requires Node.js 22.16+, a trusted local workspace and local plaintext/shareable Markdown notes. Sealed or Rhen-denied notes are excluded. Semantic indexing, remote workspaces and existing-note updates are not supported in this preview.

See the [repository and setup guide](https://github.com/markaschmidt/Obsidian-Integrated) for the Obsidian companion, Cursor CLI configuration and implementation status.
