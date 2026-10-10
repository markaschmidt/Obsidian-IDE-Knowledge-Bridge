import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../apps/mcp-server/src/server.js';
import { fixture } from './helpers.js';
import { saveJson, approveProfile } from '@knowledge-bridge/core/service';
import { randomUUID } from 'node:crypto';

test('MCP mutation endpoint requires a reviewed handle and refuses an unavailable companion', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  f.config.scopes[0]!.write = { update: true, delete: true };
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  const server = createServer(f.service),
    client = new Client(
      { name: 'change-app-test', version: '1' },
      {
        capabilities: {
          extensions: {
            'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] },
          },
        },
      },
    );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const opened = await client.callTool({
    name: 'knowledge_change',
    arguments: { operation: 'update', content: '# Draft' },
  });
  const { sessionId } = opened._meta?.picker as { sessionId: string };
  const list = await client.listTools();
  assert.equal(
    list.tools.find((t) => t.name === 'knowledge_picker')!.annotations?.readOnlyHint,
    true,
  );
  assert.equal(
    list.tools.find((t) => t.name === 'knowledge_apply_change')!.annotations?.destructiveHint,
    true,
  );
  const unreviewed = await client.callTool({
    name: 'knowledge_apply_change',
    arguments: { sessionId, reviewId: randomUUID() },
  });
  assert.equal(unreviewed.isError, true);
  await client.callTool({
    name: 'knowledge_picker',
    arguments: { action: 'browse', sessionId, vaultId: 'notes' },
  });
  const preview = await client.callTool({
    name: 'knowledge_picker',
    arguments: {
      action: 'preview',
      sessionId,
      vaultId: 'notes',
      operation: 'update',
      path: 'Project/Decision.md',
      content: '# Draft',
    },
  });
  assert.doesNotMatch(JSON.stringify(preview.content), /linked design/);
  const { reviewId } = preview._meta?.picker as { reviewId: string };
  const denied = await client.callTool({
    name: 'knowledge_apply_change',
    arguments: { sessionId, reviewId },
  });
  assert.equal(denied.isError, true);
  assert.match(JSON.stringify(denied.content), /Open this vault in Obsidian/);
  assert.match((await f.service.read('notes', 'Project/Decision.md')).text, /linked design/);
});

for (const apps of [true, false])
  test(`change tool ${apps ? 'opens shared reviewer with private draft' : 'provides editor fallback'} without writing`, async (t) => {
    const f = await fixture();
    t.after(f.clean);
    const server = createServer(f.service),
      client = new Client(
        { name: 'change-test', version: '1' },
        {
          capabilities: apps
            ? {
                extensions: {
                  'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] },
                },
              }
            : {},
        },
      );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    t.after(async () => {
      await client.close();
      await server.close();
    });
    const result = await client.callTool({
      name: 'knowledge_change',
      arguments: { operation: 'create', content: '# Draftword' },
    });
    assert.equal(result.isError, undefined);
    assert.doesNotMatch(JSON.stringify(result.content), /Draftword/);
    if (apps) {
      const state = result._meta?.picker as { operation: string; content: string };
      assert.equal(state.operation, 'create');
      assert.equal(state.content, '# Draftword');
    } else assert.match(JSON.stringify(result.content), /review_required/);
    assert.equal((await f.service.search('Draftword')).hits.length, 0);
  });
