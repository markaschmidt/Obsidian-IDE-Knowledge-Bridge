import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const browser = await build({
  entryPoints: ['apps/chat-ui/src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
});
const composerHtml = (await readFile('apps/chat-ui/index.html', 'utf8')).replace(
  '/* COMPOSER_SCRIPT */',
  () => browser.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'),
);
await mkdir('dist/mcp', { recursive: true });
await writeFile('dist/mcp/composer.html', composerHtml);
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
await copyFile('dist/mcp/composer.html', 'apps/vscode-extension/dist/mcp/composer.html');
await copyFile('dist/mcp/composer.html', 'apps/vscode-extension/dist/composer.html');
await copyFile('LICENSE', 'apps/vscode-extension/LICENSE');
await mkdir('apps/vscode-extension/dist/skill', { recursive: true });
await copyFile('integrations/obsidian/SKILL.md', 'apps/vscode-extension/dist/skill/SKILL.md');
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
