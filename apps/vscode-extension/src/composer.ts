import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ComposerSessions, type KnowledgeService } from '@obsidian-integrated/local-service';

export async function openComposer(context: vscode.ExtensionContext, service: KnowledgeService) {
  const sessions = new ComposerSessions(service);
  const initial = await sessions.begin();
  const panel = vscode.window.createWebviewPanel(
    'obsidianIntegrated.composer',
    'Obsidian context',
    vscode.ViewColumn.Beside,
    { enableScripts: true, localResourceRoots: [], retainContextWhenHidden: false },
  );
  const nonce = randomBytes(18).toString('base64');
  const html = await readFile(join(context.extensionPath, 'dist', 'composer.html'), 'utf8');
  const content = html
    .replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';" />`,
    )
    .replace('<style>', `<style nonce="${nonce}">`)
    .replace('<script>', `<script nonce="${nonce}">`);
  let resolveMounted: (value: { mounted: boolean; workspaceId: string }) => void;
  const ready = new Promise<{ mounted: boolean; workspaceId: string }>((resolve) => {
    resolveMounted = resolve;
  });
  const timeout = setTimeout(
    () => resolveMounted({ mounted: false, workspaceId: initial.workspaceId }),
    20_000,
  );
  const listener = panel.webview.onDidReceiveMessage(async (message: unknown) => {
    const request = z
      .object({
        id: z.number().int().positive().optional(),
        type: z.enum(['ready', 'mounted', 'action', 'copy']),
        data: z.unknown().optional(),
      })
      .safeParse(message);
    if (!request.success) return;
    const { id, type, data } = request.data;
    if (type === 'mounted') {
      clearTimeout(timeout);
      resolveMounted({ mounted: true, workspaceId: initial.workspaceId });
      return;
    }
    try {
      let result: unknown;
      if (type === 'ready') result = initial;
      if (type === 'action') {
        if (!data || typeof data !== 'object') throw new Error('Invalid picker request');
        result = await sessions.dispatch({ ...data, sessionId: initial.sessionId });
      }
      if (type === 'copy') {
        const input = z
          .object({ vaultId: z.string(), paths: z.array(z.string()).min(1).max(12) })
          .strict()
          .parse(data);
        const bundle = await sessions.commit(initial.sessionId, input.vaultId, input.paths);
        await vscode.env.clipboard.writeText(JSON.stringify(bundle, null, 2));
        result = { copied: bundle.documents.length };
      }
      await panel.webview.postMessage({ id, data: result });
    } catch (error) {
      await panel.webview.postMessage({
        id,
        error: error instanceof Error ? error.message : 'Picker failed',
      });
    }
  });
  panel.onDidDispose(() => {
    sessions.close(initial.sessionId);
    clearTimeout(timeout);
    listener.dispose();
    resolveMounted({ mounted: false, workspaceId: initial.workspaceId });
  });
  context.subscriptions.push(panel);
  panel.webview.html = content;
  return ready;
}
