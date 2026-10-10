import type {
  ComposerInitial,
  ComposerPage,
  ChangePreview,
  ChangeResult,
} from '@knowledge-bridge/core/service';
import type { ComposerBridge } from './view.js';

/** One review UI, shared unchanged by Cursor, VS Code and MCP Apps. */
export function mountChanges(
  root: HTMLElement,
  initial: ComposerInitial,
  bridge: ComposerBridge,
  operation: 'create' | 'update' | 'delete',
) {
  root.innerHTML = `<header><p class="eyebrow">WORKSPACE KNOWLEDGE</p><h1></h1><p id="workspace"></p></header>
    <div class="chain" aria-label="Command and parameters"><span class="command">/obsidian</span><span id="verb" class="command"></span><label class="vault-chip">vault: <select id="vault" aria-label="Vault"></select></label><div id="chips" class="chips"></div></div>
    <p id="permission" class="notice"></p><section id="choose"><label for="filter">Documents</label><input id="filter" type="search" maxlength="200" placeholder="Find a document by title or path…" /><div id="documents" class="documents"></div><nav><button id="previous">Previous</button><span id="page"></span><button id="next">Next</button></nav></section>
    <section id="new-note"><label for="path">New note path</label><input id="path" type="text" maxlength="1000" /><p id="folder" class="notice"></p></section>
    <section id="draft"><label for="content">Complete Markdown content</label><textarea id="content" rows="12" maxlength="40000" spellcheck="false"></textarea><button id="load" type="button">Load current note</button></section>
    <p id="status" role="status" aria-live="polite"></p><p id="error" role="alert"></p>
    <section id="review" hidden><h2>Review change</h2><p id="target"></p><p id="consequence"></p><div id="before-wrap"><h3>Before</h3><pre id="before"></pre></div><div id="after-wrap"><h3>After</h3><pre id="after"></pre></div></section>
    <footer><p class="notice">Workspace and Rhen rules apply. Obsidian must be open with Knowledge Bridge editor writes enabled.</p><div class="actions"><button id="cancel">Cancel</button><button id="preview">Review change</button><button id="apply" class="primary" hidden>Apply change</button></div></footer>`;
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const vault = el<HTMLSelectElement>('vault'),
    filter = el<HTMLInputElement>('filter');
  const path = el<HTMLInputElement>('path'),
    content = el<HTMLTextAreaElement>('content');
  const previewButton = el<HTMLButtonElement>('preview'),
    apply = el<HTMLButtonElement>('apply');
  const loadButton = el<HTMLButtonElement>('load'),
    cancel = el<HTMLButtonElement>('cancel');
  const previous = el<HTMLButtonElement>('previous'),
    next = el<HTMLButtonElement>('next');
  root.querySelector('h1')!.textContent = {
    create: 'Create Obsidian note',
    update: 'Edit Obsidian note',
    delete: 'Delete Obsidian note',
  }[operation];
  el('workspace').textContent = `Workspace: ${initial.workspaceId}`;
  el('verb').textContent = operation;
  el('choose').hidden = operation === 'create';
  el('new-note').hidden = operation !== 'create';
  el('draft').hidden = operation === 'delete';
  loadButton.hidden = operation !== 'update';
  content.value = initial.content ?? '';
  filter.value = initial.query ?? '';
  if (initial.vaults.length !== 1) vault.add(new Option('Choose a vault', ''));
  for (const choice of initial.vaults) vault.add(new Option(choice.name, choice.id));
  let selected = '',
    busy = false,
    applying = false,
    finished = false,
    serial = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let review: (ChangePreview & { reviewId: string }) | undefined;
  let page: ComposerPage = { documents: [], offset: 0, pageSize: 25, total: 0 };
  const request = (input: Record<string, unknown>) =>
    bridge.request({ ...input, sessionId: initial.sessionId, vaultId: vault.value });
  const fail = (error: unknown) => {
    el('error').textContent = error instanceof Error ? error.message : String(error);
  };
  const permitted = () => {
    const config = initial.vaults.find((v) => v.id === vault.value);
    return operation === 'create' ? !!config?.captureFolder : !!config?.write?.[operation];
  };
  function invalidate() {
    review = undefined;
    el('review').hidden = true;
    render();
  }
  function render() {
    const locked = busy || finished;
    vault.disabled = locked || initial.vaults.length <= 1;
    filter.disabled = locked || !vault.value;
    path.disabled = locked || !permitted();
    content.disabled = locked || !permitted();
    loadButton.disabled = locked || !selected || !permitted();
    previewButton.disabled =
      locked || !permitted() || !(operation === 'create' ? path.value : selected);
    apply.hidden = !review;
    apply.disabled = locked || !review;
    cancel.disabled = applying || finished;
    previous.disabled = locked || !page.offset;
    next.disabled = locked || page.offset + page.pageSize >= page.total;
    el('permission').textContent = !vault.value
      ? 'Choose a scoped vault.'
      : permitted()
        ? 'This operation is enabled for this workspace.'
        : 'Enable this operation for the vault in Manage Vaults and Workspace, then reopen the builder.';
    el('chips').replaceChildren();
    if (selected) {
      const chip = document.createElement('button');
      chip.className = 'document-chip';
      chip.textContent = selected + ' ×';
      chip.disabled = locked;
      chip.setAttribute('aria-label', `Remove ${selected}`);
      chip.onclick = () => {
        selected = '';
        invalidate();
      };
      el('chips').append(chip);
    }
    el('documents').replaceChildren();
    for (const doc of page.documents) {
      const label = document.createElement('label');
      label.className = 'document-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected === doc.path;
      input.disabled = locked || !permitted();
      const text = document.createElement('span');
      text.textContent = `${doc.title} — ${doc.path}`;
      input.onchange = () => {
        selected = input.checked ? doc.path : '';
        invalidate();
        if (selected && operation === 'update' && initial.content === undefined) void loadCurrent();
      };
      label.append(input, text);
      el('documents').append(label);
    }
    el('page').textContent = page.total
      ? `${page.offset + 1}–${Math.min(page.offset + page.pageSize, page.total)} of ${page.total}`
      : '';
  }
  async function browse(offset = 0) {
    const generation = ++serial;
    invalidate();
    if (!vault.value || operation === 'create' || finished) {
      page.documents = [];
      render();
      return;
    }
    busy = true;
    el('error').textContent = '';
    render();
    try {
      const result = (await request({
        action: 'browse',
        query: filter.value.trim(),
        offset,
      })) as ComposerPage;
      if (generation === serial && !finished) page = result;
    } catch (error) {
      if (generation === serial) {
        page.documents = [];
        fail(error);
      }
    } finally {
      if (generation === serial) {
        busy = false;
        render();
      }
    }
  }
  function chooseVault() {
    selected = '';
    if (operation === 'create') {
      const config = initial.vaults.find((v) => v.id === vault.value);
      path.value = config?.captureFolder ? `${config.captureFolder}/New note.md` : '';
      el('folder').textContent = config?.captureFolder
        ? `Save inside ${config.captureFolder}. Existing folders only.${config.tagsAny.length ? ' Required tags: ' + config.tagsAny.join(', ') : ''}`
        : '';
    }
    void browse();
  }
  vault.onchange = chooseVault;
  filter.oninput = () => {
    clearTimeout(timer);
    invalidate();
    timer = setTimeout(() => void browse(), 180);
  };
  path.oninput = content.oninput = invalidate;
  previous.onclick = () => void browse(Math.max(0, page.offset - page.pageSize));
  next.onclick = () => void browse(page.offset + page.pageSize);
  async function loadCurrent() {
    if (busy || finished || !selected) return;
    busy = true;
    invalidate();
    el('error').textContent = '';
    try {
      const result = (await request({ action: 'load', path: selected })) as { content: string };
      if (!finished) content.value = result.content;
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      render();
    }
  }
  loadButton.onclick = () => void loadCurrent();
  previewButton.onclick = async () => {
    if (busy || finished) return;
    busy = true;
    clearTimeout(timer);
    invalidate();
    el('error').textContent = '';
    try {
      const result = (await request({
        action: 'preview',
        operation,
        path: operation === 'create' ? path.value : selected,
        ...(operation !== 'delete' ? { content: content.value } : {}),
      })) as ChangePreview & { reviewId: string };
      if (finished) return;
      review = result;
      el('target').textContent =
        `${operation} · ${vault.selectedOptions[0]?.textContent} · ${result.path}`;
      el('consequence').textContent =
        operation === 'delete'
          ? 'Move this note to the vault’s .trash folder. Links in other notes are preserved and may become unresolved.'
          : 'The complete After content will be saved. If the note changes, this review is rejected.';
      el('before-wrap').hidden = result.before === null;
      el('after-wrap').hidden = result.after === null;
      el('before').textContent = result.before;
      el('after').textContent = result.after;
      el('review').hidden = false;
      el('status').textContent = 'Nothing has changed yet. Review the content, then apply.';
      apply.textContent =
        operation === 'delete'
          ? 'Move to trash'
          : operation === 'create'
            ? 'Create note'
            : 'Save changes';
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      render();
    }
  };
  apply.onclick = async () => {
    if (busy || finished || !review) return;
    busy = applying = true;
    render();
    el('error').textContent = '';
    try {
      const result = (await request({
        action: 'apply',
        reviewId: review.reviewId,
      })) as ChangeResult;
      finished = true;
      el('status').textContent =
        `${result.operation === 'delete' ? 'Moved to trash' : 'Saved'}: ${result.path}.${result.recovery ? ' ' + result.recovery : ''}`;
      // Notification failure must never retry an already-applied edit.
      try {
        await bridge.changed?.(result);
      } catch {
        el('status').textContent +=
          ' The change succeeded, but its confirmation could not be sent to chat.';
      }
    } catch (error) {
      fail(error);
    } finally {
      busy = applying = false;
      render();
    }
  };
  cancel.onclick = async () => {
    if (applying) return;
    finished = true;
    ++serial;
    clearTimeout(timer);
    render();
    el('status').textContent = 'Cancelled. No changes were applied.';
    try {
      await request({ action: 'close' });
    } catch {
      /* Handle expires. */
    }
  };
  render();
  chooseVault();
  return () => {
    finished = true;
    ++serial;
    clearTimeout(timer);
  };
}
