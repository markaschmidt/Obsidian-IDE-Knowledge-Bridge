import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  ComposerSessions,
  approveProfile,
  readRegistry,
  saveJson,
  type ComposerBundle,
} from '@knowledge-bridge/core/service';
import { fixture } from '../helpers.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../apps/mcp-server/src/server.js';

test('shared browser UI chains vaults and documents, filters, removes chips, and delivers explicitly', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const other = join(f.base, 'other-vault');
  await mkdir(other);
  await writeFile(join(other, 'Second.md'), '# Second vault\nOnly second-vault text.');
  const registry = await readRegistry(f.registry);
  registry.vaults.push({ id: 'second', name: 'Second vault', root: other, rhen: 'auto' });
  await saveJson(f.registry, registry);
  await saveJson(f.profile, {
    ...f.config,
    scopes: [...f.config.scopes, { vaultId: 'second', include: ['**/*.md'] }],
  });
  await approveProfile(f.registry, f.profile);
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
  t.after(() => browser.close());
  const sessions = new ComposerSessions(f.service),
    delivered: ComposerBundle[] = [];
  const mount = async (page: Page) => {
    page.on('pageerror', (error) => console.error('Picker browser error:', error.message));
    const initial = await sessions.begin();
    await page.exposeFunction(
      'pickerHost',
      async (request: { type: string; data?: Record<string, unknown> }) => {
        if (request.type === 'ready') return initial;
        if (request.type === 'action') return sessions.dispatch(request.data);
        if (request.type === 'copy') {
          const bundle = await sessions.commit(
            initial.sessionId,
            request.data!.vaultId as string,
            request.data!.paths as string[],
          );
          delivered.push(bundle);
          return { copied: bundle.documents.length };
        }
      },
    );
    await page.addInitScript({
      content: `
      window.acquireVsCodeApi = () => ({ postMessage: async (request) => {
        try { const data = await window.pickerHost(request); window.dispatchEvent(new MessageEvent('message', { data: { id: request.id, data } })); }
        catch (error) { window.dispatchEvent(new MessageEvent('message', { data: { id: request.id, error: error.message } })); }
      } });
    `,
    });
    await page.goto('about:blank');
    await page.setContent(await readFile(resolve('dist/mcp/composer.html'), 'utf8'));
    await page
      .getByRole('heading', { name: 'Add Obsidian context' })
      .waitFor({ timeout: 10_000 })
      .catch(async (error) => {
        console.error(await page.locator('body').innerText());
        throw error;
      });
  };
  const page = await browser.newPage({ viewport: { width: 740, height: 850 } });
  await mount(page);
  assert.equal(await page.getByRole('button', { name: 'Copy for chat' }).isEnabled(), false);
  await page.getByLabel('Vault', { exact: true }).selectOption('notes');
  await page.getByRole('checkbox', { name: /Architecture/ }).check();
  await page.getByRole('checkbox', { name: /Decision/ }).check();
  assert.equal(
    await page.getByRole('button', { name: 'Remove Architecture', exact: true }).count(),
    1,
  );
  await page.getByRole('button', { name: 'Remove Architecture', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { name: /Architecture/ }).isChecked(), false);
  await page.getByLabel('Documents', { exact: true }).fill('Architecture');
  await page.waitForFunction(() => document.querySelectorAll('.document-row').length === 1);
  assert.equal(await page.getByRole('button', { name: 'Remove Decision', exact: true }).count(), 1);
  assert.equal(delivered.length, 0);
  await page.screenshot({ path: resolve('dist/composer-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Copy for chat' }).click();
  await page.getByRole('status').filter({ hasText: 'Selected context copied' }).waitFor();
  assert.deepEqual(
    delivered[0]!.documents.map((d) => d.path),
    ['Project/Decision.md'],
  );
  assert.doesNotMatch(JSON.stringify(delivered), /Use local retrieval/);
  const second = await browser.newPage();
  await mount(second);
  await second.getByLabel('Vault', { exact: true }).selectOption('notes');
  await second.getByRole('checkbox', { name: /Architecture/ }).check();
  await second.getByLabel('Vault', { exact: true }).selectOption('second');
  await second.getByRole('checkbox', { name: /Second/ }).waitFor();
  assert.equal(await second.getByRole('button', { name: /Remove Architecture/ }).count(), 0);
  assert.equal(await second.getByRole('button', { name: 'Copy for chat' }).isEnabled(), false);
  await second.getByRole('button', { name: 'Cancel', exact: true }).click();
  await second.getByRole('status').filter({ hasText: 'Cancelled' }).waitFor();
  assert.equal(delivered.length, 1);
});

test('MCP App uses the same chips and sends only explicit selection through the real browser SDK', async (t) => {
  const f = await fixture();
  t.after(f.clean);
  const server = createServer(f.service);
  const client = new Client(
    { name: 'browser-host', version: '1' },
    {
      capabilities: {
        extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
      },
    },
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const opened = await client.callTool({ name: 'knowledge_select', arguments: {} });
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 740, height: 850 } });
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => console.error('MCP App browser error:', error.message));
  const delivered: unknown[] = [];
  let rejectDelivery = true;
  await page.exposeFunction('mcpHost', async (request: { method: string; params: any }) => {
    if (request.method === 'tools/call') return client.callTool(request.params);
    if (request.method === 'ui/message') {
      if (rejectDelivery) {
        rejectDelivery = false;
        return { isError: true };
      }
      delivered.push(request.params);
      return {};
    }
    throw new Error('Unexpected host request: ' + request.method);
  });
  await page.setContent(
    '<iframe title="Obsidian picker" style="width:100%;height:820px;border:0"></iframe>',
  );
  await page.evaluate(`(({ html, opened }) => {
    const frame = document.querySelector('iframe');
    const send = value => frame.contentWindow.postMessage({ jsonrpc: '2.0', ...value }, '*');
    window.addEventListener('message', async event => {
      if (event.source !== frame.contentWindow) return;
      const request = event.data;
      if (request.method === 'ui/initialize') {
        send({ id: request.id, result: { protocolVersion: request.params.protocolVersion, hostInfo: { name: 'test-host', version: '1' }, hostCapabilities: { serverTools: {}, message: { text: {} } }, hostContext: { theme: 'dark' } } });
      } else if (request.method === 'ui/notifications/initialized') {
        send({ method: 'ui/notifications/tool-result', params: opened });
      } else if (request.id !== undefined) {
        try { send({ id: request.id, result: await window.mcpHost(request) }); }
        catch (error) { send({ id: request.id, error: { code: -32000, message: error.message } }); }
      }
    });
    frame.srcdoc = html;
  })(${JSON.stringify({ html: await readFile(resolve('dist/mcp/composer.html'), 'utf8'), opened })})`);
  const app = page.frameLocator('iframe');
  await app
    .getByRole('heading', { name: 'Add Obsidian context' })
    .waitFor()
    .catch(async (error) => {
      console.error(await app.locator('body').innerText());
      throw error;
    });
  await app.getByRole('checkbox', { name: /Decision/ }).check();
  assert.equal(await app.getByLabel('Vault', { exact: true }).isDisabled(), true);
  assert.equal(delivered.length, 0);
  await page.screenshot({ path: resolve('dist/composer-chat-preview.png'), fullPage: true });
  await app.getByRole('button', { name: 'Add to chat' }).click();
  await app.getByText('The host did not accept the context.', { exact: false }).waitFor();
  assert.equal(delivered.length, 0);
  assert.equal(await app.getByRole('button', { name: 'Remove Decision', exact: true }).count(), 1);
  await app.getByRole('button', { name: 'Add to chat' }).click();
  await app.getByRole('status').filter({ hasText: 'Selected context sent' }).waitFor();
  assert.equal(delivered.length, 1);
  assert.match(JSON.stringify(delivered), /linked design decision/);
  assert.doesNotMatch(JSON.stringify(delivered), /Use local retrieval/);
});
