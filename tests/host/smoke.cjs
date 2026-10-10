const assert = require('node:assert/strict');
const { readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const vscode = require('vscode');

exports.run = async () => {
  const extension = vscode.extensions.getExtension('markaschmidt.obsidian-integrated');
  assert.ok(extension, 'Development extension was not loaded');
  await extension.activate();
  assert.ok(extension.isActive);
  const commands = await vscode.commands.getCommands(true);
  for (const name of ['enableChat', 'copyDocumentsForChat', 'manageVaults', 'search', 'capture']) {
    assert.ok(commands.includes(`obsidianIntegrated.${name}`), `Missing command: ${name}`);
  }
  await vscode.commands.executeCommand('obsidianIntegrated.enableChat');
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const installed = await readFile(join(root, '.agents', 'skills', 'obsidian', 'SKILL.md'), 'utf8');
  const bundled = await readFile(
    join(extension.extensionPath, 'dist', 'skill', 'SKILL.md'),
    'utf8',
  );
  assert.equal(installed, bundled);
  const composer = await vscode.commands.executeCommand('obsidianIntegrated.openComposer');
  assert.equal(composer?.mounted, true, 'Shared context builder did not mount in the real webview');
  const result = {
    app: vscode.env.appName,
    version: vscode.version,
    extensionVersion: extension.packageJSON.version,
    active: extension.isActive,
    trusted: vscode.workspace.isTrusted,
    slashSkillInstalled: true,
    sharedComposerMounted: composer.mounted,
    cursorMcpApi: typeof vscode.cursor?.mcp?.registerServer === 'function',
    vscodeMcpApi: typeof vscode.lm?.registerMcpServerDefinitionProvider === 'function',
  };
  await writeFile(join(root, 'host-result.json'), JSON.stringify(result, null, 2));
};
