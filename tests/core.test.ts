import test from 'node:test';
import assert from 'node:assert/strict';
import {
  notePath,
  profileSchema,
  parseNote,
  resolveLink,
  graph,
  search,
  pathInScope,
  scopeSchema,
} from '@obsidian-integrated/core';
import { isSealed } from '@obsidian-integrated/rhen-adapter';

test('paths reject traversal, drive paths, streams and hidden files', () => {
  for (const path of [
    '../note.md',
    'C:/x.md',
    'a\\b.md',
    '/x.md',
    'a//b.md',
    '.obsidian/data.md',
    'a:secret.md',
    'A/../B.md',
    'CON.md',
    'trailing./note.md',
  ])
    assert.throws(() => notePath(path), path);
  assert.equal(notePath('Project/Valid note.md'), 'Project/Valid note.md');
});
test('explicit include, exclude and hidden folder policies', () => {
  const scope = scopeSchema.parse({
    vaultId: 'v',
    include: ['Project/**/*.md'],
    exclude: ['**/private/**'],
  });
  assert.ok(pathInScope('Project/Note.md', scope));
  assert.ok(!pathInScope('Project/private/Note.md', scope));
  assert.ok(!pathInScope('Other/Note.md', scope));
});
test('duplicate vault scopes and unsupported configuration fields are rejected', () => {
  const scope = { vaultId: 'v', include: ['**/*.md'] };
  assert.throws(() =>
    profileSchema.parse({ version: 1, workspaceId: 'x', name: 'x', scopes: [scope, scope] }),
  );
  assert.throws(() => scopeSchema.parse({ ...scope, root: '/etc' }));
});
test('frontmatter, wikilinks, markdown links and code fences are parsed', () => {
  const n = parseNote(
    'v',
    'A.md',
    '---\ntags: [one]\naliases: [Alias]\n---\n# Heading\n[[B|label]] and ![[C]] and [link](D.md) #inline\n```\n[[not-a-link]]\n```',
    'r',
  );
  assert.deepEqual(n.aliases, ['Alias']);
  assert.deepEqual(n.tags, ['one', 'inline']);
  assert.deepEqual(n.links.sort(), ['B', 'C', 'D.md']);
  assert.equal(n.chunks[0]?.startLine, 5);
});
test('graph preserves direction, resolves aliases and omits unavailable targets', () => {
  const a = parseNote('v', 'Folder/A.md', '[[B#Heading]] [[Elsewhere]]', '1'),
    b = parseNote('v', 'Folder/B.md', '---\naliases: [Beta]\n---\nbody', '2');
  assert.equal(resolveLink(a, 'Beta', [a, b])?.id, b.id);
  assert.deepEqual([...graph([a, b]).get(a.id)!], [b.id]);
  assert.equal(resolveLink(a, 'https://example.com', [a, b]), undefined);
});
test('ambiguous basenames and cross-vault aliases never resolve', () => {
  const a = parseNote('v', 'A.md', '[[B]]', '1'),
    b = parseNote('v', 'One/B.md', 'x', '2'),
    c = parseNote('v', 'Two/B.md', 'y', '3'),
    d = parseNote('other', 'B.md', 'z', '4');
  assert.equal(resolveLink(a, 'B', [a, b, c, d]), undefined);
  assert.equal(resolveLink(a, 'B', [a, d]), undefined);
});
test('search adds bounded one-hop context with stable citations', () => {
  const a = parseNote('v', 'A.md', '# A\nquantum retrieval [[B]]', '1'),
    b = parseNote('v', 'B.md', '# B\nDecision rationale', '2');
  const hits = search([a, b], 'quantum', { maxResults: 4, maxChars: 500, graphHops: 1 });
  assert.equal(hits[0]?.path, 'A.md');
  assert.ok(hits.some((h) => h.path === 'B.md' && h.reason === 'linked'));
  assert.ok(hits.reduce((sum, h) => sum + h.text.length, 0) <= 500);
  assert.match(hits[0]!.uri, /#L1$/);
});
test('sealed current and future envelopes are rejected independently of lock settings', () => {
  for (const value of ['SLATE1:abc', '\uFEFFSLATE1:abc', 'RHEN2:abc', ' \nSLATE2:abc'])
    assert.ok(isSealed(value));
  assert.ok(!isSealed('# public note'));
});
