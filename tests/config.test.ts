import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, link } from 'node:fs/promises';
import { join } from 'node:path';
import { profileSchema, registrySchema } from '@obsidian-integrated/core';
import { saveJson, approveProfile } from '@obsidian-integrated/local-service';
import { fixture } from './helpers.js';

test('checked-in templates satisfy runtime configuration contracts', async () => {
  profileSchema.parse(JSON.parse(await readFile('examples/workspace.profile.json', 'utf8')));
  registrySchema.parse(JSON.parse(await readFile('examples/registry.example.json', 'utf8')));
});
test('required Rhen mode rejects a missing installation', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const registry = JSON.parse(await readFile(f.registry, 'utf8'));
  registry.vaults[0].rhen = 'required';
  await saveJson(f.registry, registry);
  await assert.rejects(f.service.search('retrieval'), /Required Rhen/);
});
test('hard-linked notes cannot alias outside content', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const outside = join(f.base, 'outside.md');
  await writeFile(outside, 'externalword');
  await link(outside, join(f.vault, 'Project', 'Alias.md'));
  await assert.rejects(f.service.search('externalword'), /Linked/);
});
test('capture rejects a destination outside the approved include patterns', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  f.config.scopes[0]!.exclude = ['Project/Inbox/**'];
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  await assert.rejects(
    f.service.capture({
      vaultId: 'notes',
      requestId: 'one',
      title: 'Title',
      content: 'Text',
      source: 'mcp',
    }),
    /included/,
  );
});
