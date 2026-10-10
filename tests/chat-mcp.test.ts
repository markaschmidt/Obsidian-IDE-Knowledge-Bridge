import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ElicitRequestSchema,
  type ClientCapabilities,
  type ElicitRequest,
  type ElicitResult,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../apps/mcp-server/src/server.js';
import { approveProfile, readRegistry, saveJson } from '@knowledge-bridge/core/service';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers.js';

async function connect(
  t: TestContext,
  elicitation: ClientCapabilities['elicitation'],
  handler?: (request: ElicitRequest) => Promise<ElicitResult>,
) {
  const f = await fixture();
  t.after(f.clean);
  const server = createServer(f.service);
  const client = new Client(
    { name: 'picker-test', version: '1' },
    { capabilities: elicitation ? { elicitation } : {} },
  );
  if (handler) client.setRequestHandler(ElicitRequestSchema, handler);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  return { f, client };
}
test('MCP form returns only selected resources, with no linked-note expansion', async (t) => {
  let calls = 0;
  const { client } = await connect(t, { form: {} }, async (request) => {
    calls++;
    assert.ok('requestedSchema' in request.params);
    assert.ok(JSON.stringify(request.params).includes('Project/Decision.md'));
    assert.ok(!JSON.stringify(request.params).includes('linked design decision'));
    return { action: 'accept', content: { document_1: true } };
  });
  const result = await client.callTool({ name: 'knowledge_select', arguments: {} });
  assert.equal(calls, 1);
  assert.ok(!result.isError);
  assert.match(JSON.stringify(result), /linked design decision/);
  assert.doesNotMatch(JSON.stringify(result), /Use local retrieval|different project/);
  const content = result.content as { type: string; resource?: { uri: string } }[];
  assert.equal(content.filter((c) => c.type === 'resource').length, 1);
  assert.match(content[1]!.resource!.uri, /Project\/Decision.md$/);
});
test('MCP presents the vault form before documents when multiple vaults are scoped', async (t) => {
  let calls = 0;
  const { f, client } = await connect(t, { form: {} }, async (request): Promise<ElicitResult> => {
    calls++;
    if (calls === 1) {
      assert.match(JSON.stringify(request.params), /choose a vault/);
      return { action: 'accept', content: { vault: 'second' } };
    }
    assert.match(JSON.stringify(request.params), /Only.md/);
    assert.doesNotMatch(JSON.stringify(request.params), /Architecture.md/);
    return { action: 'accept', content: { document_0: true } };
  });
  const second = join(f.base, 'second');
  await mkdir(second);
  await writeFile(join(second, 'Only.md'), '# Only\nSecond vault text');
  const registry = await readRegistry(f.registry);
  registry.vaults.push({ id: 'second', name: 'Second', root: second, rhen: 'auto' });
  await saveJson(f.registry, registry);
  await saveJson(f.profile, {
    ...f.config,
    scopes: [...f.config.scopes, { vaultId: 'second', include: ['**/*.md'] }],
  });
  await approveProfile(f.registry, f.profile);
  const result = await client.callTool({ name: 'knowledge_select', arguments: {} });
  assert.ok(!result.isError);
  assert.equal(calls, 2);
  assert.match(JSON.stringify(result), /Second vault text/);
});
for (const action of ['cancel', 'decline'] as const)
  test(`MCP ${action} returns no note bodies`, async (t) => {
    const { client } = await connect(t, { form: {} }, async () => ({ action }));
    const result = await client.callTool({ name: 'knowledge_select', arguments: {} });
    assert.match(JSON.stringify(result), /cancelled/);
    assert.doesNotMatch(JSON.stringify(result), /linked design decision|Use local retrieval/);
  });
test('unsupported or URL-only clients receive a fallback without reading a vault', async (t) => {
  for (const capability of [undefined, { url: {} }]) {
    const { f, client } = await connect(t, capability);
    f.service.pickerScope = async () => {
      throw new Error('Must not access the service');
    };
    const result = await client.callTool({ name: 'knowledge_select', arguments: {} });
    assert.ok(!result.isError);
    assert.match(JSON.stringify(result), /picker_unavailable/);
  }
});
test('legacy elicitation clients receive primitive checkboxes', async (t) => {
  const { client } = await connect(t, {}, async (request) => {
    assert.ok('requestedSchema' in request.params);
    assert.doesNotMatch(JSON.stringify(request.params), /"type":"array"/);
    assert.match(JSON.stringify(request.params), /document_1/);
    return { action: 'accept', content: { document_1: true } };
  });
  const result = await client.callTool({ name: 'knowledge_select', arguments: {} });
  assert.ok(!result.isError, JSON.stringify(result));
  assert.match(JSON.stringify(result), /linked design decision/);
  assert.doesNotMatch(JSON.stringify(result), /Use local retrieval/);
});
test('a note sealed while its form is open causes an error without partial context', async (t) => {
  const { f, client } = await connect(t, { form: {} }, async () => {
    await writeFile(join(f.vault, 'Project', 'Architecture.md'), 'SLATE1:synthetic');
    return { action: 'accept', content: { document_0: true, document_1: true } };
  });
  const result = await client.callTool({ name: 'knowledge_select', arguments: {} });
  assert.equal(result.isError, true);
  assert.doesNotMatch(
    JSON.stringify(result),
    /linked design decision|Use local retrieval|synthetic/,
  );
});
