# Obsidian Integrated

A development preview for scoped knowledge sharing with Obsidian in Cursor and VS Code.

Run **Obsidian Integrated: Manage Vaults and Workspace** to register vaults and configure a workspace profile. Use **Search Workspace Knowledge** to retrieve notes and **Capture Selection to Vault** to save selected text into an approved inbox.

After configuration, submit **`/obsidian`** in Agent chat. Choose a vault when more than one is scoped, then check the documents to add to that conversation. The host renders the MCP forms after submission. Only selected documents are returned, subject to the workspace context budget and a fresh access check. Existing profiles can use **Enable /obsidian in This Workspace**. Reload the editor if it has not discovered the command yet.

For clients without chat forms, **Copy Documents for Chat** offers native pickers and copies the selected context for you to paste. No private chat database or undocumented composer API is used. See the [chat workflow](https://github.com/markaschmidt/Obsidian-Integrated/blob/main/docs/CHAT.md) for supported behavior and live acceptance limits.

Requires Node.js 22.16+, a trusted local workspace and local plaintext/shareable Markdown notes. Sealed or Rhen-denied notes are excluded. Semantic indexing, remote workspaces and existing-note updates are not supported in this preview.

See the [repository and setup guide](https://github.com/markaschmidt/Obsidian-Integrated) for the Obsidian companion, Cursor CLI configuration and implementation status.
