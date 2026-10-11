import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAlreadyPublished } from './release-policy.mjs';

const vsix = process.argv[2];
if (!vsix) {
  console.error('Usage: node scripts/publish-vsix.mjs <path-to.vsix>');
  process.exit(1);
}
if (!process.env.VSCE_PAT) {
  console.error('VSCE_PAT is required to publish to the Visual Studio Marketplace.');
  process.exit(1);
}
if (!process.env.OVSX_PAT) {
  console.error(
    'OVSX_PAT is required to publish to Open VSX, which is the registry Cursor searches.',
  );
  process.exit(1);
}

function binary(name) {
  const windows = `node_modules/.bin/${name}.cmd`;
  if (process.platform === 'win32' && existsSync(windows)) return windows;
  return `node_modules/.bin/${name}`;
}

function run(name, args) {
  return new Promise((resolve) => {
    const child = spawn(binary(name), args, {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const collect = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function publish(name, args, label) {
  const result = await run(name, args);
  if (result.code === 0 || isAlreadyPublished(result.output)) {
    console.log(`${label} accepted`);
    return;
  }
  process.exit(result.code || 1);
}

const namespace = await run('ovsx', ['create-namespace', 'markaschmidt']);
if (namespace.code !== 0 && !isAlreadyPublished(namespace.output)) {
  console.error(
    'Open VSX namespace creation failed. Publishing will surface a token or namespace error.',
  );
}

await publish(
  'vsce',
  ['publish', '--packagePath', vsix, '--skip-duplicate'],
  'Visual Studio Marketplace',
);
await publish('ovsx', ['publish', vsix, '--skip-duplicate'], 'Open VSX');
