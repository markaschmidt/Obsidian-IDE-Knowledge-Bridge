import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../apps/mcp-server/src/server.js';
import { fixture } from './helpers.js';

test('MCP exposes a fixed workspace with retrieval and capture round trip', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const server = createServer(f.service),
    client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  assert.equal((await client.listTools()).tools.length, 6);
  const result = await client.callTool({
    name: 'knowledge_search',
    arguments: { query: 'retrieval' },
  });
  assert.ok(JSON.stringify(result).includes('Architecture.md'));
  assert.ok(!result.isError);
  const denied = await client.callTool({
    name: 'knowledge_read',
    arguments: { vaultId: 'notes', path: 'Other/Secret.md' },
  });
  assert.equal(denied.isError, true);
  const capture = await client.callTool({
    name: 'knowledge_capture',
    arguments: {
      vaultId: 'notes',
      requestId: 'mcp-1',
      title: 'Handoff',
      content: 'handoffword',
      source: 'mcp',
    },
  });
  assert.ok(!capture.isError);
  assert.ok(
    JSON.stringify(
      await client.callTool({ name: 'knowledge_search', arguments: { query: 'handoffword' } }),
    ).includes('handoffword'),
  );
  assert.ok(
    (await client.listResources()).resources.some(
      (r) => r.uri === 'obsidian-integrated://workspace',
    ),
  );
});
