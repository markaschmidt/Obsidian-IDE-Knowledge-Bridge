import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
};
await build({
  ...common,
  entryPoints: ['apps/mcp-server/src/main.ts'],
  outfile: 'dist/mcp/server.mjs',
  format: 'esm',
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
await build({
  ...common,
  entryPoints: ['apps/vscode-extension/src/extension.ts'],
  outfile: 'apps/vscode-extension/dist/extension.cjs',
  format: 'cjs',
  external: ['vscode'],
});
await mkdir('apps/vscode-extension/dist/mcp', { recursive: true });
await copyFile('dist/mcp/server.mjs', 'apps/vscode-extension/dist/mcp/server.mjs');
await copyFile('LICENSE', 'apps/vscode-extension/LICENSE');
await build({
  ...common,
  entryPoints: ['apps/obsidian-plugin/src/main.ts'],
  outfile: 'apps/obsidian-plugin/main.js',
  format: 'cjs',
  external: ['obsidian'],
  target: 'es2022',
});
await mkdir('dist/obsidian-integrated', { recursive: true });
await copyFile('apps/obsidian-plugin/main.js', 'dist/obsidian-integrated/main.js');
await copyFile('apps/obsidian-plugin/manifest.json', 'dist/obsidian-integrated/manifest.json');
