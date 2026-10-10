import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fixture } from '../helpers.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
test('built standalone server speaks MCP over stdio', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const client = new Client(
    { name: 'stdio-smoke', version: '1' },
    { capabilities: { elicitation: { form: {} } } },
  );
  let forms = 0;
  client.setRequestHandler(ElicitRequestSchema, async () => {
    forms++;
    return { action: 'accept', content: { document_1: true } };
  });
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
  const selected = await client.callTool({ name: 'knowledge_select', arguments: {} });
  assert.ok(!selected.isError);
  assert.equal(forms, 1);
  assert.match(JSON.stringify(selected), /linked design decision/);
  assert.doesNotMatch(JSON.stringify(selected), /Use local retrieval/);
});
