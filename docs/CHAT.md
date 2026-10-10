# Choose Obsidian documents in chat

Version 0.3 provides one shared context builder for Cursor and VS Code: **/obsidian → vault → document chips**. The same HTML, controls and selection logic run as an embedded MCP App and as an editor panel. Host framing can differ, but the picker itself is shared.

## Interaction

1. Submit `/obsidian` in Agent chat. The shared workspace skill invokes `knowledge_select`.
2. A context builder opens in the tool response on hosts supporting MCP Apps. Choose a vault when several are scoped. A single scoped vault is selected automatically.
3. Search document titles or paths, check documents and remove individual chips. Selections survive filtering and paging. Changing vault clears the selection.
4. Press **Add to chat**. The service checks scope, Rhen policy and note revisions again, then the app sends only the chosen context to the current conversation. Opening the picker alone adds no note bodies.

The builder opens **after command submission**. It does not inject custom tokens into either editor's private input composer. Embedding and message acceptance belong to the host; signed-in chat acceptance remains to be exercised in each editor. The application itself is tested in a browser with the official MCP Apps SDK, including rejected delivery and retry.

For access before sending a chat command, run **Obsidian IDE Knowledge Bridge: Open Obsidian Context Builder**. This opens the same controls in an editor panel in both products. Its final button is **Copy for chat**; paste that result into the desired conversation. It does not silently send a message.

## Optional native argument chain

The MCP server also exposes an `obsidian` prompt with dependent `vault` and `document` autocomplete. Document suggestions are restricted by the selected vault and approved workspace scope. This route returns one selected document; the shared builder supports several.

VS Code documents MCP prompt argument dialogs and slash names such as `/mcp.<server>.obsidian`. Cursor documents prompts but its exact argument-completion presentation has not been verified here. Host prompt naming, menus and dialogs can differ. The common `/obsidian` skill and context builder are the consistent multi-document route.

## Selection and boundaries

- Choose up to 12 documents from one vault per invocation. Invoke again for another scoped vault.
- Lists use 25 documents per page and case-insensitive title/path filtering. No document is checked by default.
- Includes, exclusions, tags, Rhen denials and sealed-envelope checks apply before a document is offered. Scoping a vault does not offer every note.
- Titles and relative paths go to the UI. In the MCP App route, handles, choices and prepared bodies travel in app-only tool metadata. Note bodies enter model-visible chat only after **Add to chat**. The host receives the selected content during delivery.
- Selected notes are re-read before return. Changes to content, scope or vault bindings invalidate the selection with no partial result. Reopen the picker to refresh.
- The workspace `retrieval.maxChars` budget is divided among selections. Every result has revisions, line ranges, character counts and a truncation flag.
- Each picker has an independent random handle, expires after 15 minutes, and closes on cancellation or successful delivery. No selection is remembered across chats. Already shared notes remain in the host's conversation.
- Delivery errors preserve the selection for retry. No graph neighbors are automatically attached.
- No temporary plaintext context files or private chat database access are used. Notes remain untrusted reference data.

## Compatibility

MCP Apps hosts get the shared chip UI. Hosts advertising only elicitation receive the earlier vault/document forms with equivalent scope checks. Hosts with neither capability receive a fallback instruction without scanning notes. **Copy Documents for Chat** remains available as a compact native picker.

The standalone harness uses the same fixed profile and policy. UI-capable harnesses can render the app; interactive form-capable harnesses use forms. Non-interactive clients use the scoped search/read/capture tools. See [SETUP.md](SETUP.md) for independent CLI configuration.

## Setup and troubleshooting

Configure a vault scope through **Manage Vaults and Workspace**, or run **Enable /obsidian in This Workspace** for an existing profile. This installs `.agents/skills/obsidian/SKILL.md` in each workspace folder. Unmodified shipped v0.2 skills upgrade; custom or edited skills are preserved and reported. Reload the editor or start a new chat if the host has not discovered the skill.

The skill alone does not configure MCP or grant vault access. Enable the workspace server in the host's MCP settings. Avoid duplicate manual and extension registrations. Cursor and VS Code maintain separate local registries by default; configure each explicitly.

Official references: [Cursor MCP](https://cursor.com/docs/mcp), [Cursor skills](https://cursor.com/docs/skills), [VS Code MCP and Apps](https://code.visualstudio.com/api/extension-guides/ai/mcp), [VS Code skills](https://code.visualstudio.com/docs/agent-customization/agent-skills), [MCP Apps SDK](https://apps.extensions.modelcontextprotocol.io/api/documents/Quickstart.html), and [dependent argument completion](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion).
