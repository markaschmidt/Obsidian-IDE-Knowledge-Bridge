import { readFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.argv[2] ?? pkg.version;
if (tag !== pkg.version) throw new Error('Release tag must equal package version');
for (const path of ['apps/vscode-extension/package.json', 'apps/mcp-server/package.json']) {
  if (JSON.parse(await readFile(path, 'utf8')).version !== tag)
    throw new Error('Editor and server versions must match this release');
}
console.log('Release version verified:', tag);
