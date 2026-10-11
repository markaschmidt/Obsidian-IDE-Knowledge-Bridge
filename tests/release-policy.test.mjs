import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isAlreadyPublished,
  lockfileVersionMarkers,
  nextVersion,
  replaceFirstVersion,
  replaceVersionAfter,
  splitCommitRecords,
  titleAccepted,
} from '../scripts/release-policy.mjs';

test('staging accepts conventional titles and rejects loose text', () => {
  assert.equal(titleAccepted('feat: add workspace search', 'staging'), true);
  assert.equal(titleAccepted('fix(chat): keep the selected vault', 'staging'), true);
  assert.equal(titleAccepted('feat!: replace the profile schema', 'staging'), true);
  assert.equal(titleAccepted('update the extension', 'staging'), false);
  assert.equal(titleAccepted('feat:', 'staging'), false);
  assert.equal(titleAccepted('promote: ship 0.6.0', 'staging'), false);
});

test('main accepts only promotion titles', () => {
  assert.equal(titleAccepted('promote: ship workspace writes', 'main'), true);
  assert.equal(titleAccepted('promote: add release automation [skip release]', 'main'), true);
  assert.equal(titleAccepted('feat: add workspace search', 'main'), false);
});

test('version bumps follow the highest conventional commit', () => {
  assert.equal(nextVersion('0.5.0', ['chore: refresh ci', 'docs: clarify setup']), '0.5.1');
  assert.equal(nextVersion('0.5.0', ['fix: correct a path', 'feat: add capture']), '0.6.0');
  assert.equal(
    nextVersion('0.5.1', ['feat: add capture\n\nBREAKING CHANGE: profile field renamed']),
    '1.0.0',
  );
  assert.equal(nextVersion('1.2.3', []), '1.2.4');
  assert.throws(() => nextVersion('v0.5.0', ['fix: typo']), /major\.minor\.patch/);
});

test('commit records stay intact when subjects contain newlines', () => {
  const records = splitCommitRecords('feat: one\n\nbody\u001e\nfix: two\u001e');
  assert.deepEqual(records, ['feat: one\n\nbody', 'fix: two']);
  assert.equal(nextVersion('0.5.0', records), '0.6.0');
});

test('version replacement stays inside the owned package blocks', () => {
  const source = [
    '{',
    '  "name": "obsidian-ide-knowledge-bridge",',
    '  "version": "0.5.0",',
    '  "packages": {',
    '    "": {',
    '      "name": "obsidian-ide-knowledge-bridge",',
    '      "version": "0.5.0"',
    '    },',
    '    "node_modules/xml2js": {',
    '      "version": "0.5.0"',
    '    }',
    '  }',
    '}',
  ].join('\n');
  const root = replaceFirstVersion(source, '0.5.1');
  const owned = replaceVersionAfter(
    root,
    '"": {\n      "name": "obsidian-ide-knowledge-bridge"',
    '0.5.1',
  );
  assert.match(owned, /"name": "obsidian-ide-knowledge-bridge",\n  "version": "0\.5\.1"/);
  assert.match(owned, /"name": "obsidian-ide-knowledge-bridge",\n      "version": "0\.5\.1"/);
  assert.match(owned, /"node_modules\/xml2js": \{\n      "version": "0\.5\.0"/);
});

test('lockfile markers bump owned packages and leave dependencies alone', async () => {
  let lockfile = await readFile(new URL('../package-lock.json', import.meta.url), 'utf8');
  for (const marker of lockfileVersionMarkers) {
    lockfile = replaceVersionAfter(lockfile, marker, '9.9.9');
  }
  assert.match(lockfile, /"name": "obsidian-ide-knowledge-bridge",\n  "version": "9\.9\.9"/);
  assert.match(
    lockfile.slice(
      lockfile.indexOf('"apps/vscode-extension"'),
      lockfile.indexOf('"apps/vscode-extension"') + 180,
    ),
    /"version": "9\.9\.9"/,
  );
  assert.match(
    lockfile.slice(
      lockfile.indexOf('"node_modules/@knowledge-bridge/core"'),
      lockfile.indexOf('"node_modules/@knowledge-bridge/core"') + 120,
    ),
    /"version": "0\.5\.0"/,
  );
  assert.match(
    lockfile.slice(
      lockfile.indexOf('"node_modules/xml2js"'),
      lockfile.indexOf('"node_modules/xml2js"') + 80,
    ),
    /"version": "0\.5\.0"/,
  );
});

test('marketplace retries recognize a version that is already published', () => {
  assert.equal(isAlreadyPublished('Error: Version 0.5.0 already exists.'), true);
  assert.equal(isAlreadyPublished('The extension was published.'), false);
});
