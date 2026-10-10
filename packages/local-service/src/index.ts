import { open } from 'node:fs/promises';
import { z } from 'zod';
import {
  parseNote,
  pathInScope,
  search,
  graph,
  notePath,
  type Note,
  type PickerScope,
  type DocumentChoice,
  MAX_SELECTED_DOCUMENTS,
} from '@obsidian-integrated/core';
import { readRhenPolicy, isSealed } from '@obsidian-integrated/rhen-adapter';
import { digest, loadApproved, profileDigest } from './config.js';
import { listMarkdown, readNoteFile, safePath } from './files.js';
export * from './config.js';
export * from './files.js';
export * from './composer.js';

export const captureSchema = z
  .object({
    vaultId: z.string().min(1).max(80),
    requestId: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(40000),
    source: z.enum(['cursor', 'vscode', 'obsidian', 'mcp']),
    sessionId: z.string().max(200).optional(),
  })
  .strict();
export type Capture = z.infer<typeof captureSchema>;
export class KnowledgeService {
  private cache = new Map<string, Note>();
  constructor(
    readonly registryPath: string,
    readonly profilePath: string,
  ) {}
  async status() {
    const { profile } = await loadApproved(this.registryPath, this.profilePath);
    return {
      workspaceId: profile.workspaceId,
      name: profile.name,
      scopes: profile.scopes,
      retrieval: profile.retrieval,
      mode: 'local-lexical-preview',
    };
  }
  async snapshot(selectedVaultId?: string): Promise<{
    notes: Note[];
    profile: Awaited<ReturnType<typeof loadApproved>>['profile'];
  }> {
    const { profile, bindings } = await loadApproved(this.registryPath, this.profilePath);
    if (selectedVaultId && !bindings.some((b) => b.vault.id === selectedVaultId))
      throw new Error('Vault unavailable in this workspace scope');
    const next = new Map<string, Note>();
    const policies: { root: string; mode: 'auto' | 'required'; revision: string }[] = [];
    let bytes = 0;
    try {
      for (const { vault, scope } of bindings) {
        if (selectedVaultId && vault.id !== selectedVaultId) continue;
        const policy = await readRhenPolicy(vault.root, vault.rhen);
        policies.push({ root: vault.root, mode: vault.rhen, revision: await policy.revision() });
        for (const path of await listMarkdown(vault.root)) {
          if (!pathInScope(path, scope) || (await policy.isDenied(path))) continue;
          const text = await readNoteFile(vault.root, path);
          if (isSealed(text)) continue;
          bytes += Buffer.byteLength(text);
          if (bytes > 32_000_000)
            throw new Error('Scoped content exceeds the preview memory budget; narrow the profile');
          const revision = digest(text),
            id = `${vault.id}:${path}`;
          const cached = this.cache.get(id);
          const note =
            cached?.revision === revision ? cached : parseNote(vault.id, path, text, revision);
          if (scope.tagsAny.length && !scope.tagsAny.some((t) => note.tags.includes(t))) continue;
          next.set(id, note);
        }
        const after = await readRhenPolicy(vault.root, vault.rhen);
        if ((await policy.revision()) !== (await after.revision()))
          throw new Error('Rhen policy changed during retrieval; retry');
      }
      const current = await loadApproved(this.registryPath, this.profilePath);
      if (
        profileDigest(current.profile) !== profileDigest(profile) ||
        JSON.stringify(current.bindings) !== JSON.stringify(bindings)
      )
        throw new Error('Workspace scope changed during retrieval; retry');
      for (const policy of policies) {
        if ((await (await readRhenPolicy(policy.root, policy.mode)).revision()) !== policy.revision)
          throw new Error('Rhen policy changed during retrieval; retry');
      }
      this.cache = next;
      return { notes: [...next.values()], profile };
    } catch (error) {
      this.cache.clear();
      throw error;
    }
  }
  async pickerScope(): Promise<PickerScope> {
    const { profile, bindings } = await loadApproved(this.registryPath, this.profilePath);
    return {
      workspaceId: profile.workspaceId,
      revision: digest(JSON.stringify({ profile, bindings })),
      vaults: bindings.map(({ vault }) => ({ id: vault.id, name: vault.name })),
    };
  }
  private async assertPickerScope(expected: string): Promise<PickerScope> {
    const current = await this.pickerScope();
    if (current.revision !== expected)
      throw new Error('Workspace scope changed while choosing documents. Run /obsidian again.');
    return current;
  }
  async pickerDocuments(vaultId: string, expectedScope: string): Promise<DocumentChoice[]> {
    await this.assertPickerScope(expectedScope);
    const { notes } = await this.snapshot(vaultId);
    await this.assertPickerScope(expectedScope);
    return notes.map(({ path, title, revision }) => ({ path, title, revision }));
  }
  async selectedContext(vaultId: string, choices: DocumentChoice[], expectedScope: string) {
    const scope = await this.assertPickerScope(expectedScope);
    if (
      !choices.length ||
      choices.length > MAX_SELECTED_DOCUMENTS ||
      new Set(choices.map((c) => c.path)).size !== choices.length
    )
      throw new Error('Invalid selected document count');
    const { notes, profile } = await this.snapshot(vaultId);
    const selected = choices.map((choice) => {
      const note = notes.find((n) => n.path === choice.path && n.vaultId === vaultId);
      if (!note || note.revision !== choice.revision)
        throw new Error(
          'A selected document changed or is no longer readable. Run /obsidian again.',
        );
      return note;
    });
    await this.validateResults(selected);
    await this.assertPickerScope(expectedScope);
    const allowance = Math.floor(profile.retrieval.maxChars / selected.length);
    return {
      status: 'selected' as const,
      workspaceId: scope.workspaceId,
      contentIsUntrusted: true,
      selectionOnly: true,
      documents: selected.map((note) => {
        const text = note.text.slice(0, allowance);
        return {
          vaultId,
          path: note.path,
          title: note.title,
          revision: note.revision,
          uri: `obsidian-integrated://note/${encodeURIComponent(vaultId)}/${note.path.split('/').map(encodeURIComponent).join('/')}`,
          text,
          startLine: 1,
          endLine: text.split('\n').length,
          totalCharacters: note.text.length,
          truncated: text.length < note.text.length,
        };
      }),
    };
  }
  private async validateResults(notes: Note[]): Promise<void> {
    try {
      const { bindings } = await loadApproved(this.registryPath, this.profilePath);
      for (const note of notes) {
        const binding = bindings.find((b) => b.vault.id === note.vaultId);
        if (!binding || !pathInScope(note.path, binding.scope))
          throw new Error('Result scope changed; retry');
        const policy = await readRhenPolicy(binding.vault.root, binding.vault.rhen);
        if (await policy.isDenied(note.path)) throw new Error('Result policy changed; retry');
        const text = await readNoteFile(binding.vault.root, note.path);
        if (isSealed(text) || digest(text) !== note.revision)
          throw new Error('Result content changed; retry');
        const after = await readRhenPolicy(binding.vault.root, binding.vault.rhen);
        if ((await after.revision()) !== (await policy.revision()))
          throw new Error('Result policy changed; retry');
      }
    } catch (error) {
      this.cache.clear();
      throw error;
    }
  }
  async search(query: string) {
    if (!query.trim() || query.length > 2000)
      throw new Error('Query must contain 1-2000 characters');
    const { notes, profile } = await this.snapshot();
    const hits = search(notes, query, profile.retrieval);
    const ids = new Set(hits.map((h) => h.noteId));
    await this.validateResults(notes.filter((n) => ids.has(n.id)));
    return { workspaceId: profile.workspaceId, hits, contentIsUntrusted: true };
  }
  async read(vaultId: string, path: string) {
    notePath(path);
    const { notes, profile } = await this.snapshot();
    const note = notes.find((n) => n.vaultId === vaultId && n.path === path);
    if (!note) throw new Error('Note unavailable in this workspace scope');
    await this.validateResults([note]);
    return {
      workspaceId: profile.workspaceId,
      vaultId: note.vaultId,
      path: note.path,
      title: note.title,
      revision: note.revision,
      text: note.text.slice(0, 40000),
      truncated: note.text.length > 40000,
      contentIsUntrusted: true,
    };
  }
  async neighbors(vaultId: string, path: string) {
    const { notes } = await this.snapshot(),
      id = `${vaultId}:${notePath(path)}`;
    if (!notes.some((n) => n.id === id))
      throw new Error('Note unavailable in this workspace scope');
    const edges = graph(notes);
    const summarize = (n: Note) => ({
      vaultId: n.vaultId,
      path: n.path,
      title: n.title,
      revision: n.revision,
    });
    const outgoing = notes.filter((n) => edges.get(id)?.has(n.id)),
      backlinks = notes.filter((n) => edges.get(n.id)?.has(id));
    await this.validateResults([
      ...new Set([...outgoing, ...backlinks, notes.find((n) => n.id === id)!]),
    ]);
    return { outgoing: outgoing.map(summarize), backlinks: backlinks.map(summarize) };
  }
  async capture(input: Capture) {
    const data = captureSchema.parse(input);
    if (isSealed(data.content)) throw new Error('Sealed content cannot be captured');
    const { profile, bindings } = await loadApproved(this.registryPath, this.profilePath);
    const binding = bindings.find((b) => b.vault.id === data.vaultId);
    if (!binding?.scope.captureFolder)
      throw new Error('No capture destination is enabled for this vault');
    const { scope, vault } = binding;
    const key = digest(`${profile.workspaceId}\0${data.requestId}`).slice(0, 32);
    const path = `${scope.captureFolder}/${key}.md`;
    if (!pathInScope(path, scope))
      throw new Error('Capture destination must also be included in the readable scope');
    const policy = await readRhenPolicy(vault.root, vault.rhen);
    if (await policy.isDenied(path)) throw new Error('Rhen denies the capture destination');
    const filename = await safePath(vault.root, path, true);
    const payloadHash = digest(JSON.stringify(data));
    const tags = scope.tagsAny.length ? [scope.tagsAny[0]] : [];
    const text = [
      '---',
      `title: ${JSON.stringify(data.title)}`,
      `oi_workspace: ${JSON.stringify(profile.workspaceId)}`,
      `oi_request: ${JSON.stringify(data.requestId)}`,
      `oi_payload: ${payloadHash}`,
      `oi_source: ${data.source}`,
      `oi_session: ${JSON.stringify(data.sessionId ?? '')}`,
      `tags: ${JSON.stringify(tags)}`,
      '---',
      '',
      `# ${data.title.replace(/[\r\n]/g, ' ')}`,
      '',
      data.content,
      '',
    ].join('\n');
    const after = await readRhenPolicy(vault.root, vault.rhen);
    if ((await policy.revision()) !== (await after.revision()))
      throw new Error('Rhen policy changed; retry capture');
    const latest = await loadApproved(this.registryPath, this.profilePath);
    if (profileDigest(latest.profile) !== profileDigest(profile))
      throw new Error('Workspace scope changed; retry capture');
    try {
      const file = await open(filename, 'wx', 0o600);
      try {
        await file.writeFile(text);
        await file.sync();
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readNoteFile(vault.root, path);
      if (existing !== text)
        throw new Error('Capture request conflicts with an existing note; use a new request ID');
      return { vaultId: vault.id, path, created: false, revision: digest(text) };
    }
    return { vaultId: vault.id, path, created: true, revision: digest(text) };
  }
}
