import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, unlink, symlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers.js';
import { approveProfile, saveJson, KnowledgeService } from '@obsidian-integrated/local-service';

test('search, read and graph stay inside a workspace', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const result = await f.service.search('retrieval');
  assert.equal(result.hits[0]?.path, 'Project/Architecture.md');
  assert.ok(!JSON.stringify(result).includes('different project'));
  await assert.rejects(f.service.read('notes', 'Other/Secret.md'), /unavailable/);
  assert.equal(
    (await f.service.neighbors('notes', 'Project/Decision.md')).backlinks[0]?.path,
    'Project/Architecture.md',
  );
});
test('two profiles bound to one vault do not share results', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const other = join(f.base, 'other.json');
  await saveJson(other, {
    ...f.config,
    workspaceId: 'project-b',
    scopes: [{ vaultId: 'notes', include: ['Other/**/*.md'] }],
  });
  await approveProfile(f.registry, other);
  const second = new KnowledgeService(f.registry, other);
  assert.ok((await second.search('retrieval')).hits.every((h) => h.path.startsWith('Other/')));
  assert.ok((await f.service.search('retrieval')).hits.every((h) => h.path.startsWith('Project/')));
});
test('profile changes revoke access until explicitly approved', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  await saveJson(f.profile, { ...f.config, scopes: [{ vaultId: 'notes', include: ['**/*.md'] }] });
  await assert.rejects(f.service.search('retrieval'), /not approved/);
  await approveProfile(f.registry, f.profile);
  assert.ok((await f.service.search('retrieval')).hits.some((h) => h.path === 'Other/Secret.md'));
});
test('frontmatter tag constraints apply before graph expansion', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  f.config.scopes[0]!.tagsAny = ['project'];
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  const results = await f.service.search('retrieval');
  assert.equal(results.hits.length, 1);
  assert.equal(results.hits[0]?.path, 'Project/Architecture.md');
});
test('sealing, editing and deleting notes invalidates cached retrieval', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  await f.service.search('retrieval');
  await writeFile(join(f.vault, 'Project', 'Architecture.md'), 'SLATE1:synthetic-ciphertext');
  assert.equal((await f.service.search('retrieval')).hits.length, 0);
  await writeFile(join(f.vault, 'Project', 'Architecture.md'), '# Revised\nnewkeyword');
  assert.equal((await f.service.search('newkeyword')).hits.length, 1);
  await unlink(join(f.vault, 'Project', 'Architecture.md'));
  assert.equal((await f.service.search('newkeyword')).hits.length, 0);
});
test('Rhen denials are case insensitive and do not accept unverified unlock exceptions', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const dir = join(f.vault, '.obsidian', 'plugins', 'rhen-info-vault');
  await mkdir(dir, { recursive: true });
  await saveJson(join(dir, 'data.json'), {
    lockedFiles: [],
    lockedFolders: ['project'],
    unlockedFiles: ['Project/Architecture.md'],
  });
  assert.equal((await f.service.search('retrieval')).hits.length, 0);
  await assert.rejects(
    f.service.capture({
      vaultId: 'notes',
      requestId: 'one',
      title: 'Title',
      content: 'Text',
      source: 'mcp',
    }),
    /Rhen denies/,
  );
});
test('missing and malformed installed Rhen policy fail closed', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const dir = join(f.vault, '.obsidian', 'plugins', 'rhen-info-vault');
  await mkdir(dir, { recursive: true });
  await assert.rejects(f.service.search('retrieval'));
  await writeFile(join(dir, 'data.json'), '{}');
  await assert.rejects(f.service.search('retrieval'), /format/);
});
test('legacy Slate installation is not mistaken for an unprotected vault', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  await mkdir(join(f.vault, '.obsidian', 'plugins', 'slate-infosec'), { recursive: true });
  await assert.rejects(f.service.search('retrieval'), /Legacy Slate/);
});
test('capture is create-only, idempotent and becomes graph-searchable', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const input = {
    vaultId: 'notes',
    requestId: 'decision-1',
    title: 'Decision',
    content: 'New approach [[Architecture]]',
    source: 'cursor' as const,
    sessionId: 's1',
  };
  const first = await f.service.capture(input),
    second = await f.service.capture(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.path, second.path);
  assert.ok((await f.service.search('approach')).hits.some((h) => h.path === first.path));
  assert.ok(
    (await f.service.neighbors('notes', 'Project/Architecture.md')).backlinks.some(
      (n) => n.path === first.path,
    ),
  );
  await assert.rejects(f.service.capture({ ...input, content: 'Changed' }), /conflicts/);
  assert.match(await readFile(join(f.vault, first.path), 'utf8'), /oi_session: "s1"/);
});
test('read-only scopes and excluded capture destinations cannot be written', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  f.config.scopes[0]!.captureFolder = undefined;
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  await assert.rejects(
    f.service.capture({
      vaultId: 'notes',
      requestId: '1',
      title: 'x',
      content: 'x',
      source: 'mcp',
    }),
    /No capture/,
  );
});
test('symlinks cannot expose another folder or become capture destinations', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const linked = join(f.vault, 'Project', 'Linked');
  await symlink(join(f.vault, 'Other'), linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.service.read('notes', 'Project/Linked/Secret.md'), /unavailable/);
  f.config.scopes[0]!.captureFolder = 'Project/Linked';
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  await assert.rejects(
    f.service.capture({
      vaultId: 'notes',
      requestId: '1',
      title: 'x',
      content: 'x',
      source: 'mcp',
    }),
    /Linked/,
  );
});
