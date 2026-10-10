import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  pickDocuments,
  type DocumentChoice,
  type DocumentPicker,
  type SelectionSource,
} from '@obsidian-integrated/core';
import { approveProfile, saveJson, readRegistry } from '@obsidian-integrated/local-service';
import { fixture } from './helpers.js';

const documents = (count: number): DocumentChoice[] =>
  Array.from({ length: count }, (_, i) => ({
    path: `Note-${i}.md`,
    title: `Note ${i}`,
    revision: `${i}`,
  }));
const source = (count = 2, multiple = false): SelectionSource => ({
  async pickerScope() {
    return {
      workspaceId: 'test',
      revision: 'scope-1',
      vaults: [{ id: 'a', name: 'A' }, ...(multiple ? [{ id: 'b', name: 'B' }] : [])],
    };
  },
  async pickerDocuments(id, revision) {
    assert.ok(['a', 'b'].includes(id));
    assert.equal(revision, 'scope-1');
    return documents(count);
  },
});
const noVault = async (): Promise<string | undefined> => {
  throw new Error('Single vault should skip the vault picker');
};

test('one vault skips its picker and only explicit documents are selected', async () => {
  const result = await pickDocuments(source(), {
    chooseVault: noVault,
    async chooseDocuments(page) {
      assert.equal(page.vault.id, 'a');
      return { paths: ['Note-1.md'], action: 'attach' };
    },
  });
  assert.equal(result.status, 'selected');
  if (result.status === 'selected')
    assert.deepEqual(
      result.documents.map((d) => d.path),
      ['Note-1.md'],
    );
});
test('multiple vaults require a user choice and cancellation stops before listing notes', async () => {
  let listed = false;
  const data = source(2, true);
  data.pickerDocuments = async () => {
    listed = true;
    return [];
  };
  const result = await pickDocuments(data, {
    async chooseVault(vaults) {
      assert.equal(vaults.length, 2);
      return undefined;
    },
    async chooseDocuments() {
      throw new Error('Unexpected document form');
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(listed, false);
});
test('forged vaults, paths, duplicate selections and excessive selections are rejected', async () => {
  await assert.rejects(
    pickDocuments(source(2, true), {
      async chooseVault() {
        return 'elsewhere';
      },
      async chooseDocuments() {
        return undefined;
      },
    }),
    /not offered/,
  );
  for (const paths of [
    ['elsewhere.md'],
    ['Note-0.md', 'Note-0.md'],
    documents(13).map((d) => d.path),
  ]) {
    await assert.rejects(
      pickDocuments(source(13), {
        chooseVault: noVault,
        async chooseDocuments() {
          return { paths, action: 'attach' };
        },
      }),
      /not offered|at most/,
    );
  }
});
test('paging and filtering preserve explicit choices and allow deselection', async () => {
  let step = 0;
  const result = await pickDocuments(source(30), {
    chooseVault: noVault,
    async chooseDocuments(page) {
      step++;
      if (step === 1) {
        assert.equal(page.documents.length, 25);
        return { paths: ['Note-0.md'], action: 'next' };
      }
      if (step === 2) {
        assert.equal(page.selectedCount, 1);
        return { paths: ['Note-26.md'], action: 'filter', filter: 'Note 0' };
      }
      assert.deepEqual(page.selectedOnPage, ['Note-0.md']);
      assert.equal(page.selectedCount, 2);
      return { paths: [], action: 'attach' };
    },
  });
  assert.equal(result.status, 'selected');
  if (result.status === 'selected')
    assert.deepEqual(
      result.documents.map((d) => d.path),
      ['Note-26.md'],
    );
});
test('empty filters can be changed and simultaneous conversations never share selection', async () => {
  const choose = (path: string): DocumentPicker => ({
    chooseVault: noVault,
    async chooseDocuments(page) {
      if (page.filter) {
        assert.equal(page.documents.length, 0);
        return { paths: [], action: 'filter', filter: '' };
      }
      return { paths: [path], action: 'attach' };
    },
  });
  const results = await Promise.all(
    ['Note-0.md', 'Note-1.md'].map((path) =>
      pickDocuments(source(), choose(path), { query: 'missing' }),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.status === 'selected' && r.documents.map((d) => d.path)),
    [['Note-0.md'], ['Note-1.md']],
  );
});
test('document cancellation or a cancelled request returns no chosen documents', async () => {
  const picker: DocumentPicker = {
    chooseVault: noVault,
    async chooseDocuments() {
      return undefined;
    },
  };
  assert.equal((await pickDocuments(source(), picker)).status, 'cancelled');
  await assert.rejects(pickDocuments(source(), picker, { signal: AbortSignal.abort() }), /abort/i);
});
test('paging refreshes policy and rejects a previously chosen document that disappears', async () => {
  const data = source(30);
  let reads = 0;
  data.pickerDocuments = async () => (++reads === 1 ? documents(30) : documents(30).slice(1));
  let forms = 0;
  await assert.rejects(
    pickDocuments(data, {
      chooseVault: noVault,
      async chooseDocuments() {
        forms++;
        return { paths: ['Note-0.md'], action: 'next' };
      },
    }),
    /no longer readable/,
  );
  assert.equal(forms, 1);
});
test('picker metadata and selected context enforce scope, Rhen and explicit document boundaries', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  await writeFile(join(f.vault, 'Project', 'Sealed.md'), 'SLATE1:synthetic');
  await writeFile(join(f.vault, 'Project', 'Locked.md'), '# Locked\nlocked-body');
  const policyDir = join(f.vault, '.obsidian', 'plugins', 'rhen-info-vault');
  await mkdir(policyDir, { recursive: true });
  await saveJson(join(policyDir, 'data.json'), {
    lockedFiles: ['Project/Locked.md'],
    lockedFolders: [],
  });
  const scope = await f.service.pickerScope();
  const choices = await f.service.pickerDocuments('notes', scope.revision);
  assert.deepEqual(
    choices.map((d) => d.path),
    ['Project/Architecture.md', 'Project/Decision.md'],
  );
  assert.ok(!JSON.stringify(choices).includes('Use local retrieval'));
  const bundle = await f.service.selectedContext('notes', [choices[1]!], scope.revision);
  assert.equal(bundle.documents.length, 1);
  assert.match(bundle.documents[0]!.text, /linked design decision/);
  assert.ok(!JSON.stringify(bundle).includes('Use local retrieval'));
  assert.equal(bundle.selectionOnly, true);
  await assert.rejects(f.service.pickerDocuments('unscoped', scope.revision), /unavailable/);
});
for (const change of ['edit', 'seal', 'lock', 'profile', 'binding'] as const) {
  test(`a ${change} while the picker is open invalidates the selection`, async (t) => {
    const f = await fixture();
    t.after(f.clean);
    const scope = await f.service.pickerScope();
    const choices = await f.service.pickerDocuments('notes', scope.revision);
    if (change === 'edit' || change === 'seal')
      await writeFile(
        join(f.vault, choices[0]!.path),
        change === 'seal' ? 'SLATE1:synthetic' : '# New content',
      );
    if (change === 'lock') {
      const dir = join(f.vault, '.obsidian', 'plugins', 'rhen-info-vault');
      await mkdir(dir, { recursive: true });
      await saveJson(join(dir, 'data.json'), {
        lockedFiles: [choices[0]!.path],
        lockedFolders: [],
      });
    }
    if (change === 'profile') {
      f.config.scopes[0]!.exclude = ['Project/Decision.md'];
      await saveJson(f.profile, f.config);
      await approveProfile(f.registry, f.profile);
    }
    if (change === 'binding') {
      const registry = await readRegistry(f.registry);
      registry.vaults[0]!.root = join(f.base, 'moved');
      await saveJson(f.registry, registry);
    }
    await assert.rejects(
      f.service.selectedContext('notes', choices, scope.revision),
      /changed|readable/,
    );
  });
}
test('selected context shares the workspace character budget and explicitly marks truncation', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  f.config.retrieval.maxChars = 2000;
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  await writeFile(
    join(f.vault, 'Project', 'Architecture.md'),
    '# Architecture\n' + 'a'.repeat(5000),
  );
  await writeFile(join(f.vault, 'Project', 'Decision.md'), '# Decision\n' + 'b'.repeat(5000));
  const scope = await f.service.pickerScope();
  const choices = await f.service.pickerDocuments('notes', scope.revision);
  const bundle = await f.service.selectedContext('notes', choices, scope.revision);
  assert.equal(
    bundle.documents.reduce((sum, d) => sum + d.text.length, 0),
    2000,
  );
  assert.ok(bundle.documents.every((d) => d.truncated && d.totalCharacters > d.text.length));
});
