import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ComposerSessions, saveJson, approveProfile } from '@obsidian-integrated/local-service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../apps/mcp-server/src/server.js';
import { fixture } from './helpers.js';

test('composer sessions require offered documents, isolate handles and return only chosen bodies', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const sessions = new ComposerSessions(f.service),
    first = await sessions.begin(),
    second = await sessions.begin();
  const page = await sessions.browse(first.sessionId, 'notes', '', 0);
  assert.deepEqual(
    page.documents.map((d) => d.path),
    ['Project/Architecture.md', 'Project/Decision.md'],
  );
  await assert.rejects(
    sessions.commit(second.sessionId, 'notes', ['Project/Decision.md']),
    /Invalid/,
  );
  await assert.rejects(sessions.commit(first.sessionId, 'notes', ['Other/Secret.md']), /offered/);
  const bundle = await sessions.commit(first.sessionId, 'notes', ['Project/Decision.md']);
  assert.equal(bundle.documents.length, 1);
  assert.match(bundle.documents[0]!.text, /linked design decision/);
  assert.doesNotMatch(JSON.stringify(bundle), /Use local retrieval/);
  sessions.close(first.sessionId);
  await assert.rejects(
    sessions.commit(first.sessionId, 'notes', ['Project/Decision.md']),
    /expired/,
  );
});
test('composer preserves the first offered revision even after subsequent browsing', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const sessions = new ComposerSessions(f.service),
    state = await sessions.begin();
  await sessions.browse(state.sessionId, 'notes', '', 0);
  await writeFile(join(f.vault, 'Project', 'Decision.md'), '# Changed\nChanged while selecting');
  await sessions.browse(state.sessionId, 'notes', '', 0);
  await assert.rejects(
    sessions.commit(state.sessionId, 'notes', ['Project/Decision.md']),
    /changed/,
  );
});
test('composer sessions expire and invalidate on reapproved scope changes', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  let now = 0;
  const sessions = new ComposerSessions(f.service, () => now);
  const expired = await sessions.begin();
  now = 16 * 60_000;
  await assert.rejects(sessions.browse(expired.sessionId, 'notes', '', 0), /expired/);
  const changed = await sessions.begin();
  f.config.scopes[0]!.exclude = ['Project/Architecture.md'];
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  await assert.rejects(sessions.browse(changed.sessionId, 'notes', '', 0), /scope changed/);
});
test('MCP Apps picker negotiates UI support and keeps browse data out of model-visible content', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const server = createServer(f.service),
    client = new Client(
      { name: 'app-host', version: '1' },
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
  const tools = (await client.listTools()).tools;
  assert.deepEqual(
    (tools.find((t) => t.name === 'knowledge_picker')!._meta?.ui as { visibility: string[] })
      .visibility,
    ['app'],
  );
  const opened = await client.callTool({ name: 'knowledge_select', arguments: {} });
  const state = opened._meta?.picker as { sessionId: string };
  assert.ok(state.sessionId);
  assert.doesNotMatch(JSON.stringify(opened.content), /Architecture|Decision|retrieval/);
  const choices = await client.callTool({
    name: 'knowledge_picker',
    arguments: { sessionId: state.sessionId, action: 'browse', vaultId: 'notes' },
  });
  assert.match(JSON.stringify(choices._meta), /Architecture/);
  assert.doesNotMatch(JSON.stringify(choices.content), /Architecture|Decision|retrieval/);
  const selected = await client.callTool({
    name: 'knowledge_picker',
    arguments: {
      sessionId: state.sessionId,
      action: 'commit',
      vaultId: 'notes',
      paths: ['Project/Decision.md'],
    },
  });
  assert.match(JSON.stringify(selected._meta), /linked design decision/);
  assert.doesNotMatch(JSON.stringify(selected.content), /linked design decision/);
});
test('native prompt completions depend on the approved vault and reject forged paths', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const server = createServer(f.service),
    client = new Client({ name: 'prompt-host', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const complete = (name: string, value: string, vault?: string) =>
    client.complete({
      ref: { type: 'ref/prompt', name: 'obsidian' },
      argument: { name, value },
      context: { arguments: vault ? { vault } : {} },
    });
  assert.deepEqual((await complete('vault', '')).completion.values, ['notes']);
  assert.deepEqual((await complete('document', 'dec', 'notes')).completion.values, [
    'Project/Decision.md',
  ]);
  assert.deepEqual((await complete('document', '', 'forged')).completion.values, []);
  await assert.rejects(
    client.getPrompt({
      name: 'obsidian',
      arguments: { vault: 'notes', document: 'Other/Secret.md' },
    }),
    /unavailable/,
  );
  const prompt = await client.getPrompt({
    name: 'obsidian',
    arguments: { vault: 'notes', document: 'Project/Decision.md' },
  });
  assert.match(JSON.stringify(prompt), /linked design decision/);
  assert.doesNotMatch(JSON.stringify(prompt), /Use local retrieval/);
});
