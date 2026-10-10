import type {
  ComposerInitial,
  ComposerPage,
  ComposerBundle,
  ChangeResult,
} from '@knowledge-bridge/core/service';
import type { DocumentChoice } from '@knowledge-bridge/core';
import { mountChanges } from './changes.js';

export interface ComposerBridge {
  request(input: Record<string, unknown>): Promise<unknown>;
  deliver(bundle: ComposerBundle): Promise<void>;
  mode: 'chat' | 'clipboard';
  changed?(result: ChangeResult): Promise<void>;
}
export function mountKnowledge(
  root: HTMLElement,
  initial: ComposerInitial,
  bridge: ComposerBridge,
) {
  root.replaceChildren();
  const label = document.createElement('label');
  label.textContent = 'Action ';
  const action = document.createElement('select');
  action.setAttribute('aria-label', 'Action');
  for (const [name, value] of [
    ['Read notes', 'read'],
    ['Create note', 'create'],
    ['Edit note', 'update'],
    ['Delete note', 'delete'],
  ])
    action.add(new Option(name, value));
  action.value = initial.operation ?? 'read';
  label.append(action);
  root.append(label);
  const body = document.createElement('div');
  root.append(body);
  let dispose: (() => void) | undefined;
  const mount = () => {
    dispose?.();
    dispose =
      action.value === 'read'
        ? mountComposer(body, initial, bridge)
        : mountChanges(body, initial, bridge, action.value as 'create' | 'update' | 'delete');
  };
  // Lock action changes during requests, including an in-flight mutation.
  let pending = 0;
  let closed = false;
  const originalRequest = bridge.request.bind(bridge);
  bridge = {
    ...bridge,
    request: async (input) => {
      action.disabled = true;
      pending++;
      try {
        const result = await originalRequest(input);
        if (input.action === 'close' || input.action === 'apply') closed = true;
        return result;
      } finally {
        action.disabled = --pending > 0 || closed;
      }
    },
  };
  action.onchange = mount;
  mount();
  return () => dispose?.();
}
/** The same DOM, state transitions and controls run in both editors and MCP Apps. */
export function mountComposer(root: HTMLElement, initial: ComposerInitial, bridge: ComposerBridge) {
  root.innerHTML = `<header><p class="eyebrow">WORKSPACE KNOWLEDGE</p><h1>Add Obsidian context</h1><p id="workspace"></p></header>
    <div class="chain" aria-label="Command and parameters"><span class="command">/obsidian</span><span aria-hidden="true">›</span><label class="vault-chip">vault: <select id="vault" aria-label="Vault"></select></label><div id="chips" class="chips" aria-label="Selected documents"></div></div>
    <label class="search-label" for="filter">Documents</label><input id="filter" type="search" maxlength="200" placeholder="Find a document by title or path…" autocomplete="off" />
    <p id="status" role="status" aria-live="polite"></p><div id="documents" class="documents" aria-label="Available documents"></div>
    <nav aria-label="Document pages"><button id="previous" type="button">Previous</button><span id="page"></span><button id="next" type="button">Next</button></nav>
    <p id="error" role="alert"></p><footer><p id="count"></p><p class="notice">Only chosen documents are shared. Workspace and Rhen rules apply.</p><div class="actions"><button id="cancel" type="button">Cancel</button><button id="add" type="button" class="primary"></button></div></footer>`;
  const element = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const vault = element<HTMLSelectElement>('vault'),
    filter = element<HTMLInputElement>('filter');
  const add = element<HTMLButtonElement>('add'),
    cancel = element<HTMLButtonElement>('cancel');
  const previous = element<HTMLButtonElement>('previous'),
    next = element<HTMLButtonElement>('next');
  const selected = new Map<string, DocumentChoice>();
  let page: ComposerPage = { documents: [], offset: 0, total: 0, pageSize: 25 };
  let busy = false,
    finished = false,
    delivering = false,
    serial = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  element('workspace').textContent = `Workspace: ${initial.workspaceId}`;
  add.textContent = bridge.mode === 'chat' ? 'Add to chat' : 'Copy for chat';
  if (initial.vaults.length !== 1) vault.add(new Option('Choose a vault', ''));
  for (const choice of initial.vaults) vault.add(new Option(choice.name, choice.id));
  if (initial.vaults.length === 1) {
    vault.value = initial.vaults[0]!.id;
    vault.disabled = true;
  }
  filter.value = initial.query ?? '';
  const request = (input: Record<string, unknown>) =>
    bridge.request({ ...input, sessionId: initial.sessionId, vaultId: vault.value });
  const error = (value: unknown) => {
    element('error').textContent = value instanceof Error ? value.message : String(value);
  };
  function render() {
    const chips = element('chips');
    chips.replaceChildren();
    for (const choice of selected.values()) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'document-chip';
      chip.textContent = `${choice.title} ×`;
      chip.title = choice.path;
      chip.setAttribute('aria-label', `Remove ${choice.title}`);
      chip.disabled = busy || finished;
      chip.onclick = () => {
        selected.delete(choice.path);
        render();
      };
      chips.append(chip);
    }
    const list = element('documents');
    list.replaceChildren();
    for (const choice of page.documents) {
      const row = document.createElement('label');
      row.className = 'document-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected.has(choice.path);
      input.disabled =
        busy || finished || (!input.checked && selected.size >= initial.maxDocuments);
      const label = document.createElement('span'),
        title = document.createElement('strong'),
        path = document.createElement('small');
      title.textContent = choice.title;
      path.textContent = choice.path;
      label.append(title, path);
      row.append(input, label);
      input.onchange = () => {
        if (input.checked) selected.set(choice.path, choice);
        else selected.delete(choice.path);
        render();
      };
      list.append(row);
    }
    element('count').textContent = `${selected.size} / ${initial.maxDocuments} documents selected`;
    element('page').textContent = page.total
      ? `${page.offset + 1}–${Math.min(page.offset + page.pageSize, page.total)} of ${page.total}`
      : '';
    previous.disabled = busy || finished || page.offset === 0;
    next.disabled = busy || finished || page.offset + page.pageSize >= page.total;
    add.disabled = busy || finished || !selected.size;
    cancel.disabled = delivering || finished;
    filter.disabled = delivering || finished || !vault.value;
    vault.disabled = delivering || finished || initial.vaults.length <= 1;
  }
  async function load(offset = 0) {
    const generation = ++serial;
    if (!vault.value || finished) {
      busy = false;
      page = { documents: [], total: 0, offset: 0, pageSize: 25 };
      render();
      return;
    }
    busy = true;
    element('error').textContent = '';
    element('status').textContent = 'Finding documents…';
    render();
    try {
      const result = (await request({
        action: 'browse',
        query: filter.value.trim(),
        offset,
      })) as ComposerPage;
      if (generation !== serial || finished) return;
      page = result;
      element('status').textContent = result.total
        ? 'Choose documents below. Remove a chip to deselect it.'
        : 'No matching documents. Try another title or path.';
    } catch (e) {
      if (generation === serial) {
        page = { documents: [], total: 0, offset: 0, pageSize: 25 };
        error(e);
        element('status').textContent = 'Could not load documents.';
      }
    } finally {
      if (generation === serial) {
        busy = false;
        render();
      }
    }
  }
  vault.onchange = () => {
    selected.clear();
    filter.value = '';
    void load();
  };
  filter.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 180);
  };
  previous.onclick = () => void load(Math.max(0, page.offset - page.pageSize));
  next.onclick = () => void load(page.offset + page.pageSize);
  cancel.onclick = async () => {
    finished = true;
    ++serial;
    clearTimeout(timer);
    selected.clear();
    page.documents = [];
    render();
    element('status').textContent = 'Cancelled. No documents were added.';
    try {
      await request({ action: 'close' });
    } catch {
      /* Expiring the handle is sufficient; no content was sent. */
    }
  };
  add.onclick = async () => {
    if (busy || finished || !selected.size) return;
    clearTimeout(timer);
    busy = true;
    delivering = true;
    element('error').textContent = '';
    render();
    try {
      const bundle = (await request({
        action: 'commit',
        paths: [...selected.keys()],
      })) as ComposerBundle;
      if (finished) return;
      await bridge.deliver(bundle);
      finished = true;
      element('status').textContent =
        bridge.mode === 'chat'
          ? 'Selected context sent to this chat.'
          : 'Selected context copied. Paste it into your chat.';
      if (bundle.documents.some((d) => d.truncated))
        element('status').textContent +=
          ' Some documents were shortened to the workspace context budget.';
      try {
        await request({ action: 'close' });
      } catch {
        /* Already delivered. */
      }
    } catch (e) {
      error(e);
    } finally {
      busy = false;
      delivering = false;
      render();
    }
  };
  element('status').textContent = initial.vaults.length
    ? 'Choose a vault to see its documents.'
    : 'No vaults are scoped. Configure one in Obsidian IDE Knowledge Bridge settings.';
  render();
  if (vault.value) void load();
  return () => {
    finished = true;
    ++serial;
    clearTimeout(timer);
  };
}
