// Optional local-host acceptance. Uses installed editor binaries and disposable profiles.
// This checks extension activation and slash-skill installation, not chat rendering.
import { spawn } from 'node:child_process';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from '../tests/helpers.js';
import { saveJson, approveProfile } from '@obsidian-integrated/local-service';

const executable = process.argv[2];
if (!executable)
  throw new Error('Usage: npx tsx scripts/host-smoke.ts /absolute/path/to/editor-executable');
const f = await fixture();
try {
  const workspace = join(f.base, 'workspace');
  const userData = join(f.base, 'editor-data');
  const storage = join(userData, 'User', 'globalStorage', 'markaschmidt.obsidian-integrated');
  const profile = join(workspace, '.obsidian-integrated', 'workspace.json');
  await mkdir(storage, { recursive: true });
  await mkdir(join(f.base, 'extensions'));
  await saveJson(profile, f.config);
  await approveProfile(f.registry, profile);
  await copyFile(f.registry, join(storage, 'vaults.json'));
  const args = [
    workspace,
    '--new-window',
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--user-data-dir',
    userData,
    '--extensions-dir',
    join(f.base, 'extensions'),
    '--extensionDevelopmentPath=' + resolve('apps/vscode-extension'),
    '--extensionTestsPath=' + resolve('tests/host/smoke.cjs'),
  ];
  const result = await new Promise<number | null>((resolveExit, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, args, { env, windowsHide: true, stdio: 'pipe' });
    // Only this isolated test process is terminated if it fails to finish.
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Editor host test timed out after 90 seconds'));
    }, 90_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolveExit(code);
    });
    child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  });
  if (result !== 0) throw new Error(`Editor host exited with ${result}`);
  console.log(await readFile(join(workspace, 'host-result.json'), 'utf8'));
} finally {
  await f.clean();
}
