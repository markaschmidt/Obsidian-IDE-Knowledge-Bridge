import * as vscode from 'vscode';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { realpath, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  emptyRegistry,
  profileSchema,
  scopeSchema,
  idSchema,
  type Registry,
} from '@knowledge-bridge/core';
import {
  KnowledgeService,
  saveJson,
  readRegistry,
  readProfile,
  approveProfile,
  safePath,
  digest,
} from '@knowledge-bridge/core/service';
import { cursorMcp } from './cursor.js';
import { installWorkspaceSkill } from './install-skill.js';
import { copyDocumentsForChat } from './chat.js';
import { openComposer } from './composer.js';

export function activate(context: vscode.ExtensionContext): void {
  const registryPath = join(context.globalStorageUri.fsPath, 'vaults.json');
  const output = vscode.window.createOutputChannel('Obsidian IDE Knowledge Bridge');
  const changes = new vscode.EventEmitter<void>();
  let cursorName: string | undefined;
  let refreshGeneration = 0;
  const cursor = cursorMcp(vscode);
  context.subscriptions.push(output, changes, {
    dispose: () => {
      if (cursorName) cursor?.unregisterServer(cursorName);
    },
  });

  function profilePath(): string {
    if (!vscode.workspace.isTrusted || vscode.env.remoteName)
      throw new Error('Open a trusted local workspace to connect vaults');
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length || folders.some((f) => f.uri.scheme !== 'file'))
      throw new Error('Open a local folder or saved workspace');
    const workspaceFile = vscode.workspace.workspaceFile;
    if (folders.length > 1 && workspaceFile?.scheme !== 'file')
      throw new Error('Save this multi-folder workspace before connecting vaults');
    const anchor =
      workspaceFile?.scheme === 'file' ? dirname(workspaceFile.fsPath) : folders[0]!.uri.fsPath;
    const setting = vscode.workspace
      .getConfiguration('obsidianIntegrated')
      .get<string>('profile', '.obsidian-integrated/workspace.json');
    if (isAbsolute(setting) || setting.split(/[\\/]/).includes('..'))
      throw new Error('Profile must be inside this workspace');
    return resolve(anchor, setting);
  }
  const service = () => new KnowledgeService(registryPath, profilePath());
  const serverArgs = () => [
    join(context.extensionPath, 'dist', 'mcp', 'server.mjs'),
    '--registry',
    registryPath,
    '--profile',
    profilePath(),
  ];
  const nodeCommand = () =>
    vscode.workspace.getConfiguration('obsidianIntegrated').get<string>('nodePath', 'node');
  async function refresh(): Promise<void> {
    const generation = ++refreshGeneration;
    if (cursorName) {
      cursor?.unregisterServer(cursorName);
      cursorName = undefined;
    }
    try {
      const status = await service().status();
      if (generation !== refreshGeneration) return;
      if (cursor) {
        cursorName = `obsidian-integrated-${status.workspaceId}-${digest(profilePath()).slice(0, 8)}`;
        cursor.registerServer({
          name: cursorName,
          server: { command: nodeCommand(), args: serverArgs(), env: {} },
        });
      }
    } catch {
      /* Unconfigured or revoked profiles intentionally publish no server. */
    }
    changes.fire();
  }
  if (!cursor && vscode.lm?.registerMcpServerDefinitionProvider) {
    context.subscriptions.push(
      vscode.lm.registerMcpServerDefinitionProvider('obsidian-integrated', {
        onDidChangeMcpServerDefinitions: changes.event,
        provideMcpServerDefinitions: async () => {
          try {
            const status = await service().status();
            return [
              new vscode.McpStdioServerDefinition(
                `Obsidian: ${status.name}`,
                nodeCommand(),
                serverArgs(),
                {},
                '0.4.0',
              ),
            ];
          } catch {
            return [];
          }
        },
        resolveMcpServerDefinition: async (definition) => {
          await service().status();
          return definition;
        },
      }),
    );
  }
  async function registry(): Promise<Registry> {
    try {
      return await readRegistry(registryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const value = emptyRegistry();
      await saveJson(registryPath, value);
      return value;
    }
  }
  async function enableChat(): Promise<void> {
    await service().status();
    const contents = await readFile(
      join(context.extensionPath, 'dist', 'skill', 'SKILL.md'),
      'utf8',
    );
    const conflicts: string[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const result = await installWorkspaceSkill(folder.uri.fsPath, contents);
      if (result.status === 'conflict') conflicts.push(result.path);
    }
    if (conflicts.length) {
      output.appendLine(`Existing /obsidian skills were preserved:\n${conflicts.join('\n')}`);
      output.show();
      void vscode.window.showWarningMessage(
        'An existing /obsidian skill was preserved. Compare it with the bundled skill before using this integration.',
      );
    } else {
      void vscode.window.showInformationMessage(
        '/obsidian is ready in this workspace. Submit it in Agent chat to choose a vault and documents.',
      );
    }
  }
  async function manage(): Promise<void> {
    const path = profilePath();
    const action = await vscode.window.showQuickPick(
      [
        'Register a vault',
        'Configure a vault for this workspace',
        'Remove a vault from this workspace',
        'Edit workspace profile',
        'Review and approve workspace profile',
        'Show registry location',
        'Enable /obsidian in this workspace',
        'Forget a vault on this machine',
      ],
      { title: 'Obsidian IDE Knowledge Bridge settings' },
    );
    if (!action) return;
    const catalog = await registry();
    let profile;
    try {
      profile = await readProfile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      profile = profileSchema.parse({
        version: 1,
        workspaceId: randomUUID(),
        name: vscode.workspace.name ?? 'Workspace',
        scopes: [],
      });
    }
    if (action === 'Register a vault') {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Register vault',
      });
      if (!selected?.[0]) return;
      const root = await realpath(selected[0].fsPath);
      const id = await vscode.window.showInputBox({
        title: 'Vault ID (portable name)',
        value: `vault-${randomUUID().slice(0, 8)}`,
        validateInput: (v) =>
          idSchema.safeParse(v).success
            ? undefined
            : 'Use letters, numbers, hyphens or underscores',
      });
      if (!id) return;
      if (catalog.vaults.some((v) => v.id === id || v.root === root))
        throw new Error('This vault is already registered');
      const name = await vscode.window.showInputBox({ title: 'Vault display name', value: id });
      if (!name) return;
      const protection = await vscode.window.showQuickPick(
        ['Detect Rhen automatically', 'Require Rhen policy'],
        { title: 'Rhen compatibility' },
      );
      if (!protection) return;
      catalog.vaults.push({
        id,
        name,
        root,
        rhen: protection === 'Require Rhen policy' ? 'required' : 'auto',
      });
      await saveJson(registryPath, catalog);
      void vscode.window.showInformationMessage(
        'Vault registered. Configure its scope for this workspace next.',
      );
    } else if (action === 'Configure a vault for this workspace') {
      const selected = await vscode.window.showQuickPick(
        catalog.vaults.map((v) => ({ label: v.name, description: v.id, vault: v })),
        { title: 'Choose a registered vault' },
      );
      if (!selected) return;
      const previous = profile.scopes.find((s) => s.vaultId === selected.vault.id);
      const include = await vscode.window.showInputBox({
        title: 'Included note globs (comma separated)',
        value: previous?.include.join(', ') ?? 'Projects/MyProject/**/*.md',
      });
      if (include === undefined) return;
      const exclude = await vscode.window.showInputBox({
        title: 'Excluded note globs (comma separated)',
        value: previous?.exclude.join(', ') ?? '',
      });
      if (exclude === undefined) return;
      const tags = await vscode.window.showInputBox({
        title: 'Require any of these tags (optional, comma separated)',
        value: previous?.tagsAny.join(', ') ?? '',
      });
      if (tags === undefined) return;
      const capture = await vscode.window.showInputBox({
        title: 'Existing capture folder relative to vault (blank means read only)',
        value: previous?.captureFolder ?? '',
      });
      if (capture === undefined) return;
      const split = (v: string) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      const scope = scopeSchema.parse({
        vaultId: selected.vault.id,
        include: split(include),
        exclude: split(exclude),
        tagsAny: split(tags),
        ...(capture.trim() ? { captureFolder: capture.trim() } : {}),
      });
      if (scope.captureFolder) await safePath(selected.vault.root, scope.captureFolder);
      profile.scopes = profile.scopes.filter((s) => s.vaultId !== scope.vaultId);
      profile.scopes.push(scope);
      await saveJson(path, profile);
      await approveProfile(registryPath, path);
      await refresh();
      await enableChat();
    } else if (action === 'Remove a vault from this workspace') {
      const selected = await vscode.window.showQuickPick(profile.scopes.map((s) => s.vaultId));
      if (!selected) return;
      profile.scopes = profile.scopes.filter((s) => s.vaultId !== selected);
      await saveJson(path, profile);
      await approveProfile(registryPath, path);
      await refresh();
    } else if (action === 'Edit workspace profile') {
      await saveJson(path, profile);
      await vscode.window.showTextDocument(vscode.Uri.file(path));
    } else if (action === 'Review and approve workspace profile') {
      await vscode.window.showTextDocument(vscode.Uri.file(path));
      const approved = await vscode.window.showWarningMessage(
        'Approve the vault scopes and write destinations in this profile for this workspace?',
        { modal: true },
        'Approve',
      );
      if (approved === 'Approve') {
        await approveProfile(registryPath, path);
        await refresh();
      }
    } else if (action === 'Show registry location') {
      output.appendLine(`Registry: ${registryPath}\nProfile: ${path}`);
      output.show();
    } else if (action === 'Enable /obsidian in this workspace') {
      await enableChat();
    } else if (action === 'Forget a vault on this machine') {
      const id = await vscode.window.showQuickPick(catalog.vaults.map((v) => v.id));
      if (!id) return;
      catalog.vaults = catalog.vaults.filter((v) => v.id !== id);
      catalog.approvals = {};
      await saveJson(registryPath, catalog);
      await refresh();
    }
  }
  function command(id: string, fn: () => Promise<void>) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async () => {
        try {
          await fn();
        } catch (error) {
          void vscode.window.showErrorMessage(
            error instanceof Error ? error.message : 'Operation failed',
          );
        }
      }),
    );
  }
  command('obsidianIntegrated.manageVaults', manage);
  command('obsidianIntegrated.enableChat', enableChat);
  command('obsidianIntegrated.copyDocumentsForChat', () => copyDocumentsForChat(service()));
  context.subscriptions.push(
    vscode.commands.registerCommand('obsidianIntegrated.openComposer', async () => {
      try {
        return await openComposer(context, service());
      } catch (error) {
        void vscode.window.showErrorMessage(
          error instanceof Error ? error.message : 'Could not open Obsidian context',
        );
        return { mounted: false };
      }
    }),
  );
  command('obsidianIntegrated.search', async () => {
    const query = await vscode.window.showInputBox({
      title: 'Search this workspace’s Obsidian knowledge',
    });
    if (!query) return;
    const result = await service().search(query);
    const selected = await vscode.window.showQuickPick(
      result.hits.map((h) => ({
        label: h.title,
        description: `${h.vaultId}/${h.path}:${h.startLine}`,
        detail: h.text.slice(0, 200),
        hit: h,
      })),
    );
    if (!selected) return;
    // Re-read through policy before opening a temporary, unbacked editor document.
    const note = await service().read(selected.hit.vaultId, selected.hit.path);
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument({ language: 'markdown', content: note.text }),
    );
  });
  command('obsidianIntegrated.capture', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) throw new Error('Select text to capture first');
    const content = editor.document.getText(editor.selection),
      status = await service().status();
    const vaultId = await vscode.window.showQuickPick(
      status.scopes.filter((s) => s.captureFolder).map((s) => s.vaultId),
      { title: 'Capture destination' },
    );
    if (!vaultId) return;
    const title = await vscode.window.showInputBox({ title: 'Knowledge note title' });
    if (!title) return;
    const result = await service().capture({
      vaultId,
      requestId: randomUUID(),
      title,
      content,
      source: vscode.env.appName.toLowerCase().includes('cursor') ? 'cursor' : 'vscode',
    });
    void vscode.window.showInformationMessage(`Saved ${result.path}`);
  });
  command('obsidianIntegrated.exportMcp', async () => {
    await service().status();
    const config = {
      mcpServers: {
        'obsidian-integrated': { type: 'stdio', command: nodeCommand(), args: serverArgs() },
      },
    };
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(config, null, 2),
      }),
    );
  });
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.json');
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(() => void refresh()),
    watcher.onDidDelete(() => void refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('obsidianIntegrated')) void refresh();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
    vscode.workspace.onDidGrantWorkspaceTrust(() => void refresh()),
  );
  void refresh();
}
