import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, symlink, link, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installWorkspaceSkill } from '../apps/vscode-extension/src/install-skill.js';
import { fixture } from './helpers.js';

for (const legacyVersion of ['0.2', '0.3'])
  test(
    'unmodified shipped ' + legacyVersion + ' skills upgrade while edited skills remain intact',
    async (t) => {
      const f = await fixture();
      t.after(f.clean);
      const legacy = await readFile(
        new URL('./fixtures/obsidian-skill-v' + legacyVersion + '.md', import.meta.url),
        'utf8',
      );
      const installed = await installWorkspaceSkill(f.base, legacy);
      assert.equal((await installWorkspaceSkill(f.base, 'new packaged skill')).status, 'updated');
      assert.equal(await readFile(installed.path, 'utf8'), 'new packaged skill');
      await writeFile(installed.path, legacy + '\nMy customization\n');
      assert.equal((await installWorkspaceSkill(f.base, 'new packaged skill')).status, 'conflict');
      assert.match(await readFile(installed.path, 'utf8'), /My customization/);
    },
  );

test('workspace skill installation is repeatable and preserves conflicting user content', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const first = await installWorkspaceSkill(f.base, 'user-visible skill');
  assert.equal(first.status, 'created');
  assert.equal((await installWorkspaceSkill(f.base, 'user-visible skill')).status, 'unchanged');
  assert.equal((await installWorkspaceSkill(f.base, 'new skill')).status, 'conflict');
  assert.equal(await readFile(first.path, 'utf8'), 'user-visible skill');
});
test('workspace skill installation rejects linked directories without writing their targets', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const target = join(f.base, 'target');
  await mkdir(target);
  await symlink(target, join(f.base, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(installWorkspaceSkill(f.base, 'skill'), /linked/);
  await assert.rejects(readFile(join(target, 'skills', 'obsidian', 'SKILL.md')), {
    code: 'ENOENT',
  });
});
test('workspace skill installation refuses a hard-linked file', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const directory = join(f.base, '.agents', 'skills', 'obsidian');
  await mkdir(directory, { recursive: true });
  const target = join(f.base, 'existing.md');
  await writeFile(target, 'existing');
  await link(target, join(directory, 'SKILL.md'));
  await assert.rejects(installWorkspaceSkill(f.base, 'skill'), /linked/);
  assert.equal(await readFile(target, 'utf8'), 'existing');
});
