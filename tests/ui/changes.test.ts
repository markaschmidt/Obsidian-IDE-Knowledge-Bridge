import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium, type Page } from 'playwright';
import {
  ComposerSessions,
  saveJson,
  approveProfile,
  publishEndpoint,
  prepareChange,
  digest,
  type ComposerSeed,
  mutationRequestSchema,
} from '@knowledge-bridge/core/service';
import { fixture } from '../helpers.js';

test('shared change UI requires preview, invalidates changed drafts, rejects stale edits and supports recoverable CRUD', async (t) => {
  const f = await fixture();
  f.config.scopes[0]!.write = { update: true, delete: true };
  await saveJson(f.profile, f.config);
  await approveProfile(f.registry, f.profile);
  let applied = 0;
  // Synthetic HTTP host exercises the real composer + core transport. The
  // Obsidian repository separately verifies its native process/trash adapter.
  const host = createServer(async (req, res) => {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = mutationRequestSchema.parse(JSON.parse(body));
      const {
        requestId: _id,
        registryPath: _r,
        profilePath: _p,
        scopeRevision,
        policyRevision: _policy,
        ...draft
      } = data;
      const preview = await prepareChange(f.service, draft, scopeRevision);
      if (draft.operation === 'delete') {
        await mkdir(join(f.vault, '.trash'), { recursive: true });
        await rename(join(f.vault, draft.path), join(f.vault, '.trash', 'Recovered.md'));
      } else
        await writeFile(join(f.vault, draft.path), preview.after!, {
          flag: draft.operation === 'create' ? 'wx' : 'w',
        });
      applied++;
      res.end(
        JSON.stringify({
          status: 'applied',
          operation: draft.operation,
          vaultId: 'notes',
          path: draft.path,
          ...(preview.after !== null
            ? { revision: digest(preview.after) }
            : { recovery: 'Restore from .trash' }),
        }),
      );
    } catch (error) {
      res.writeHead(409).end(JSON.stringify({ error: (error as Error).message }));
    }
  });
  await new Promise<void>((r) => host.listen(0, '127.0.0.1', r));
  const address = host.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  await publishEndpoint(f.vault, { version: 1, port: address.port, token: 'a'.repeat(64) });
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
  t.after(async () => {
    await browser.close();
    await new Promise<void>((r) => host.close(() => r()));
    await f.clean();
  });
  const mount = async (seed: ComposerSeed): Promise<Page> => {
    const page = await browser.newPage({ viewport: { width: 760, height: 1100 } });
    page.setDefaultTimeout(10000);
    const sessions = new ComposerSessions(f.service),
      initial = await sessions.begin(seed);
    await page.exposeFunction('pickerHost', async (request: { type: string; data: unknown }) =>
      request.type === 'ready'
        ? initial
        : request.type === 'action'
          ? sessions.dispatch(request.data)
          : undefined,
    );
    await page.addInitScript({
      content: `window.acquireVsCodeApi = () => ({ postMessage: async request => { try { const data = await window.pickerHost(request); window.dispatchEvent(new MessageEvent('message', { data: { id: request.id, data } })); } catch (error) { window.dispatchEvent(new MessageEvent('message', { data: { id: request.id, error: error.message } })); } } });`,
    });
    await page.goto('about:blank');
    await page.setContent(await readFile(resolve('dist/mcp/composer.html'), 'utf8'));
    await page.getByLabel('Action', { exact: true }).waitFor();
    return page;
  };
  const created = await mount({ operation: 'create', content: '# New handoff\n[[Decision]]' });
  await created.getByLabel('New note path', { exact: true }).fill('Project/Inbox/Reviewed.md');
  assert.equal(await created.getByRole('button', { name: 'Create note', exact: true }).count(), 0);
  await created.getByRole('button', { name: 'Review change', exact: true }).click();
  await created.getByRole('button', { name: 'Create note', exact: true }).waitFor();
  assert.equal(applied, 0);
  await created.getByRole('button', { name: 'Create note', exact: true }).click();
  await created.getByRole('status').filter({ hasText: 'Saved:' }).waitFor();
  assert.equal(applied, 1);
  const updated = await mount({ operation: 'update', query: 'Reviewed' });
  await updated.getByRole('checkbox', { name: /Reviewed/ }).check();
  await updated.getByRole('button', { name: 'Load current note' }).click();
  await updated.waitForFunction(() =>
    (document.querySelector('#content') as HTMLTextAreaElement)?.value.includes('New handoff'),
  );
  await updated.getByLabel('Complete Markdown content').fill('# Revised\n[[Architecture]]');
  await updated.getByRole('button', { name: 'Review change', exact: true }).click();
  await updated.getByRole('button', { name: 'Save changes' }).waitFor();
  assert.match(await updated.locator('#before').innerText(), /New handoff/);
  await updated.getByLabel('Complete Markdown content').fill('# Revised again\n[[Architecture]]');
  assert.equal(await updated.getByRole('button', { name: 'Save changes' }).isVisible(), false);
  await updated.getByRole('button', { name: 'Review change', exact: true }).click();
  await updated.getByRole('button', { name: 'Save changes' }).waitFor();
  await updated.screenshot({ path: resolve('dist/change-review-preview.png'), fullPage: true });
  await updated.getByRole('button', { name: 'Save changes' }).click();
  await updated.getByRole('status').filter({ hasText: 'Saved:' }).waitFor();
  assert.equal(applied, 2);
  const stale = await mount({ operation: 'update', query: 'Reviewed', content: '# Obsolete' });
  await stale.getByRole('checkbox', { name: /Reviewed/ }).check();
  await stale.getByRole('button', { name: 'Review change', exact: true }).click();
  await stale.getByRole('button', { name: 'Save changes' }).waitFor();
  await writeFile(join(f.vault, 'Project/Inbox/Reviewed.md'), '# External edit');
  await stale.getByRole('button', { name: 'Save changes' }).click();
  await stale.getByRole('alert').filter({ hasText: 'changed' }).waitFor();
  assert.equal(applied, 2);
  const cancelled = await mount({ operation: 'delete', query: 'Reviewed' });
  await cancelled.getByRole('checkbox', { name: /Reviewed/ }).check();
  await cancelled.getByRole('button', { name: 'Review change', exact: true }).click();
  await cancelled.getByRole('button', { name: 'Move to trash' }).waitFor();
  await cancelled.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(applied, 2);
  const deleted = await mount({ operation: 'delete', query: 'Reviewed' });
  await deleted.getByRole('checkbox', { name: /Reviewed/ }).check();
  await deleted.getByRole('button', { name: 'Review change', exact: true }).click();
  await deleted.getByRole('button', { name: 'Move to trash' }).click();
  await deleted.getByRole('status').filter({ hasText: 'Moved to trash:' }).waitFor();
  assert.equal(applied, 3);
  assert.equal(await readFile(join(f.vault, '.trash/Recovered.md'), 'utf8'), '# External edit');
});
