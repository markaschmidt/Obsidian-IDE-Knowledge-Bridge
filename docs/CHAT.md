# Choose Obsidian documents in chat

Version 0.2 adds a shared `/obsidian` skill and a `knowledge_select` MCP tool for Cursor and VS Code. The extension installs the skill at `.agents/skills/obsidian/SKILL.md` in each workspace folder when a vault scope is configured. Existing profiles can use **Obsidian Integrated: Enable /obsidian in This Workspace**. Existing conflicting skill files are preserved and reported.

## Interaction

1. Submit `/obsidian` in the editor's Agent chat. You can include a question, for example `/obsidian — use the notes I choose to review this design`.
2. The agent invokes the workspace's `knowledge_select` tool. If more than one vault is scoped, a chat form asks which vault to use. One scoped vault skips this step.
3. A second form lists readable documents from that vault. Check one or more documents, then submit. No document is selected by default.
4. The tool rechecks access and content revisions, then returns the chosen documents as cited MCP resources to this conversation. The agent can answer the accompanying question using them.

The host controls the bubble, card, dialog or other appearance of these forms. The picker opens **after the slash command is submitted**, through MCP elicitation. This implementation does not inject a pre-submit completion menu or custom attachment chips into either editor's composer. Agent invocation and rendering need live acceptance in each host; protocol tests alone do not prove that UI behavior.

Current official support: [Cursor skills](https://cursor.com/docs/skills), [Cursor MCP](https://cursor.com/docs/mcp), [VS Code skills](https://code.visualstudio.com/docs/agent-customization/agent-skills), [VS Code MCP](https://code.visualstudio.com/api/extension-guides/ai/mcp), and [MCP elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation). Both editors discover `.agents/skills/`. The shared skill disables automatic model invocation, so it is an explicit user action.

## Selection and boundaries

- Choose up to 12 documents per invocation, from one vault. Invoke again to add documents from another scoped vault.
- Larger lists use 25 documents per page, with next/previous actions and a case-insensitive title/path filter. Checked documents survive paging and filtering; unchecking a document removes it. A no-match filter can be cleared. The initial slash command can supply a literal filter when requested.
- Forms use standard string choices and boolean checkboxes, supported by both older and newer form clients. The SDK normalizes legacy capabilities, so the server does not assume that advertising form support means newer array widgets are available.
- Only approved workspace scopes participate. Path exclusions, tag requirements, Rhen denials, and sealed-envelope checks apply before offering documents. Scoping a vault does not imply offering every note in it.
- Forms disclose scoped titles and relative paths to the client. Bodies stay local until selection completes. Only selected bodies are returned; graph neighbors are not added automatically. The ordinary search and graph tools remain available for separate requests.
- Notes are re-read before return. Changed notes, revoked access, or changed workspace/vault bindings invalidate the selection with no partial result. Retry `/obsidian` to choose from the current state.
- The workspace `retrieval.maxChars` budget is divided among selected documents. Results include revisions, line ranges, total character counts and explicit truncation flags. Large documents may therefore be excerpts.
- Cancel/decline returns no note bodies. The skill stops rather than substituting search. Selection is per invocation, never stored globally or reused by another chat. Notes already shared remain in the host's conversation.
- The integration writes no temporary plaintext context files and does not inspect private chat databases. Note text remains untrusted reference content.

## Older clients and native fallback

If a client lacks MCP form support, `knowledge_select` returns `picker_unavailable` without scanning notes. Run **Obsidian Integrated: Copy Documents for Chat** in either editor. It uses the same vault/document picker logic and policy checks through native editor controls, copies the selected context to the clipboard, and asks you to paste it into your current chat. It does not send a message automatically. Cancelling leaves the clipboard unchanged.

The CLI/harness continues to use the same fixed profile and MCP tools. An interactive harness with elicitation support can show the picker; a non-interactive harness cannot ask the user to select documents. Configure MCP separately for an independent CLI process as described in [SETUP.md](SETUP.md).

## Troubleshooting

If `/obsidian` is missing, configure a vault scope or run **Enable /obsidian in This Workspace**, then reload the editor window or start a new chat so the host discovers the skill. The skill alone does not configure MCP or grant access. Verify that the workspace's MCP server is enabled and its tools are available. If the host asks to trust/enable the server, review its displayed definition.

If another `/obsidian` skill already exists, the extension reports the conflicting path and leaves it untouched. Compare it with `integrations/obsidian/SKILL.md`. Avoid duplicate manually registered MCP servers; one approved profile should control the current workspace. Cursor and VS Code maintain separate local registries by default, so configure each editor explicitly.
