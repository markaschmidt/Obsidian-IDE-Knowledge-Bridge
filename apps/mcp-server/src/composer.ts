import { readFile } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import {
  ComposerSessions,
  composerActionSchema,
  type KnowledgeService,
} from '@obsidian-integrated/local-service';

export const COMPOSER_URI = 'ui://obsidian-integrated/composer-v1.html';
export function registerComposer(server: McpServer, service: KnowledgeService) {
  const sessions = new ComposerSessions(service);
  registerAppResource(
    server,
    'obsidian-composer',
    COMPOSER_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: COMPOSER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(new URL('./composer.html', import.meta.url), 'utf8'),
          _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
        },
      ],
    }),
  );
  registerAppTool(
    server,
    'knowledge_picker',
    {
      description:
        'UI-only operations for the current Obsidian document picker. Does not choose documents for an agent.',
      inputSchema: composerActionSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: COMPOSER_URI, visibility: ['app'] } },
    },
    async (input) => {
      try {
        const data = await sessions.dispatch(input);
        // Titles, paths, handles and selected content go only to the UI until the
        // user presses Add to chat. They are not part of model-visible tool output.
        return {
          content: [
            {
              type: 'text',
              text:
                input.action === 'browse'
                  ? 'Document choices updated.'
                  : input.action === 'close'
                    ? 'Picker closed.'
                    : 'Selected context prepared for the user.',
            },
          ],
          _meta: { picker: data },
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            { type: 'text', text: error instanceof Error ? error.message : 'Picker failed' },
          ],
        };
      }
    },
  );
  return sessions;
}
