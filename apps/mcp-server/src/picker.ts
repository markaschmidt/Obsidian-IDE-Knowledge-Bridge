import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ElicitResultSchema,
  type ElicitRequestFormParams,
  type ElicitResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  MAX_SELECTED_DOCUMENTS,
  type DocumentPicker,
  type DocumentPage,
  type DocumentAnswer,
} from '@knowledge-bridge/core';

type Form = ElicitRequestFormParams['requestedSchema'];
const label = (text: string) => text.replace(/[\x00-\x1f]/g, ' ').slice(0, 240);

export function mcpDocumentPicker(
  server: McpServer,
  signal: AbortSignal,
): DocumentPicker | undefined {
  const capabilities = server.server.getClientCapabilities()?.elicitation;
  if (!capabilities || (!capabilities.form && Object.keys(capabilities).length)) return;
  async function ask(message: string, requestedSchema: Form): Promise<ElicitResult> {
    signal.throwIfAborted();
    const options = { signal, timeout: 300_000 };
    if (capabilities?.form)
      return server.server.elicitInput({ mode: 'form', message, requestedSchema }, options);
    // June 2025 clients advertise elicitation: {} and support flat primitive fields.
    // The current SDK's convenience method requires form: {}, so use its public request API.
    return server.server.request(
      { method: 'elicitation/create', params: { message, requestedSchema } },
      ElicitResultSchema,
      options,
    );
  }
  return {
    async chooseVault(vaults) {
      const response = await ask('Obsidian: choose a vault scoped to this workspace.', {
        type: 'object',
        properties: {
          vault: {
            type: 'string',
            title: 'Vault',
            enum: vaults.map((v) => v.id),
            enumNames: vaults.map((v) => label(`${v.name} (${v.id})`)),
          },
        },
        required: ['vault'],
      });
      if (response.action !== 'accept') return;
      if (typeof response.content?.vault !== 'string')
        throw new Error('The vault picker returned an invalid choice');
      return response.content.vault;
    },
    async chooseDocuments(page: DocumentPage): Promise<DocumentAnswer | undefined> {
      const properties: Form['properties'] = {};
      // The SDK normalizes legacy elicitation: {} into form: {}. Primitive
      // checkboxes remain compatible with both generations without guessing
      // whether the actual client can display newer array-enum widgets.
      page.documents.forEach((d, index) => {
        properties[`document_${index}`] = {
          type: 'boolean',
          title: label(`${d.title} — ${d.path}`),
          default: page.selectedOnPage.includes(d.path),
        };
      });
      if (page.canNavigate) {
        properties.action = {
          type: 'string',
          title: 'After this page',
          enum: ['attach', 'next', 'previous', 'filter'],
          default: 'attach',
        };
        properties.filter = {
          type: 'string',
          title: 'Filter titles or paths',
          maxLength: 200,
          default: page.filter,
          description:
            'Choose filter above to apply this text. Previously checked documents stay selected.',
        };
      }
      const response = await ask(
        `Obsidian: choose up to ${MAX_SELECTED_DOCUMENTS} documents from ${label(page.vault.name)}. Page ${page.page + 1}/${page.pageCount}; ${page.selectedCount} selected. Selected note text will be shared with this chat and its model provider.`,
        { type: 'object', properties },
      );
      if (response.action !== 'accept') return;
      const content = response.content ?? {};
      for (const key of Object.keys(content)) {
        if (!(key in properties)) throw new Error('The document picker returned an unknown field');
        if (key.startsWith('document_') && typeof content[key] !== 'boolean')
          throw new Error('The document picker returned invalid choices');
      }
      const paths = page.documents
        .filter((_, i) => content[`document_${i}`] === true)
        .map((d) => d.path);
      return {
        paths,
        action: (content.action ?? 'attach') as DocumentAnswer['action'],
        filter: typeof content.filter === 'string' ? content.filter : undefined,
      };
    },
  };
}
