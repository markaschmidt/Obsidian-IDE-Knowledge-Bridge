import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture } from '../helpers.js';
test('built standalone server speaks MCP over stdio', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const client = new Client({ name: 'stdio-smoke', version: '1' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('dist/mcp/server.mjs'), '--registry', f.registry, '--profile', f.profile],
      stderr: 'pipe',
    }),
  );
  t.after(() => client.close());
  const result = await client.callTool({
    name: 'knowledge_search',
    arguments: { query: 'retrieval' },
  });
  assert.ok(!result.isError);
  assert.ok(JSON.stringify(result).includes('Project/Architecture.md'));
});
