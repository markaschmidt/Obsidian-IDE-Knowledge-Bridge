import { readFile, writeFile } from 'node:fs/promises';
import {
  lockfileVersionMarkers,
  nextVersion,
  replaceFirstVersion,
  replaceVersionAfter,
  splitCommitRecords,
} from './release-policy.mjs';

const recordPath = process.argv[2];
if (!recordPath) {
  console.error('Usage: node scripts/bump-version.mjs <commit-records.txt>');
  process.exit(1);
}

const rootPath = 'package.json';
const packagePaths = [
  rootPath,
  'apps/vscode-extension/package.json',
  'apps/mcp-server/package.json',
];
const root = JSON.parse(await readFile(rootPath, 'utf8'));
const version = nextVersion(root.version, splitCommitRecords(await readFile(recordPath, 'utf8')));

for (const path of packagePaths) {
  await writeFile(path, replaceFirstVersion(await readFile(path, 'utf8'), version));
}

let lockfile = await readFile('package-lock.json', 'utf8');
for (const marker of lockfileVersionMarkers)
  lockfile = replaceVersionAfter(lockfile, marker, version);
await writeFile('package-lock.json', lockfile);
console.log(version);
