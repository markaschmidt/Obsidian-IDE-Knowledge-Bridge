import { randomUUID } from 'node:crypto';
import {
  MAX_SELECTED_DOCUMENTS,
  type DocumentChoice,
  type PickerScope,
} from '@obsidian-integrated/core';
import type { KnowledgeService } from './index.js';
import { z } from 'zod';

export const composerActionSchema = z
  .object({
    action: z.enum(['browse', 'commit', 'close']),
    sessionId: z.string().uuid(),
    vaultId: z.string().min(1).max(80).optional(),
    query: z.string().max(200).default(''),
    offset: z.number().int().min(0).max(30000).default(0),
    paths: z.array(z.string().min(1).max(2000)).max(12).default([]),
  })
  .strict();
export type ComposerInitial = Awaited<ReturnType<ComposerSessions['begin']>> & { query?: string };
export type ComposerPage = Awaited<ReturnType<ComposerSessions['browse']>>;
export type ComposerBundle = Awaited<ReturnType<ComposerSessions['commit']>>;

interface Session {
  scope: PickerScope;
  expires: number;
  vaultId?: string;
  generation: number;
  offered: Map<string, DocumentChoice>;
}
export const COMPOSER_PAGE_SIZE = 25;
/** UI instance state is scoped to a random handle, never to the last active chat. */
export class ComposerSessions {
  private sessions = new Map<string, Session>();
  constructor(
    private service: KnowledgeService,
    private now = Date.now,
  ) {}
  async begin() {
    for (const [id, session] of this.sessions)
      if (session.expires <= this.now()) this.sessions.delete(id);
    if (this.sessions.size >= 20)
      throw new Error('Too many open pickers. Close one or wait 15 minutes.');
    const scope = await this.service.pickerScope();
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      scope,
      expires: this.now() + 15 * 60_000,
      generation: 0,
      offered: new Map(),
    });
    return {
      sessionId,
      workspaceId: scope.workspaceId,
      vaults: scope.vaults,
      maxDocuments: MAX_SELECTED_DOCUMENTS,
    };
  }
  private async session(id: string) {
    const session = this.sessions.get(id);
    if (!session || session.expires <= this.now()) {
      this.sessions.delete(id);
      throw new Error('This picker expired. Open /obsidian again.');
    }
    const current = await this.service.pickerScope();
    if (session.scope.revision !== current.revision) {
      this.sessions.delete(id);
      throw new Error('Workspace scope changed. Open /obsidian again.');
    }
    return session;
  }
  async browse(id: string, vaultId: string, query: string, offset: number) {
    const session = await this.session(id);
    if (!session.scope.vaults.some((v) => v.id === vaultId))
      throw new Error('Vault unavailable in this workspace');
    if (session.vaultId !== vaultId) {
      session.vaultId = vaultId;
      session.offered.clear();
    }
    const generation = ++session.generation;
    const all = await this.service.pickerDocuments(vaultId, session.scope.revision);
    if (generation !== session.generation || !this.sessions.has(id))
      throw new Error('Picker request superseded');
    const filtered = all.filter((d) =>
      `${d.title}\n${d.path}`.toLowerCase().includes(query.toLowerCase()),
    );
    const start = Math.max(
      0,
      Math.min(
        offset,
        Math.max(0, Math.ceil(filtered.length / COMPOSER_PAGE_SIZE) - 1) * COMPOSER_PAGE_SIZE,
      ),
    );
    const documents = filtered.slice(start, start + COMPOSER_PAGE_SIZE);
    if (session.offered.size + documents.filter((d) => !session.offered.has(d.path)).length > 2000)
      throw new Error('Picker browsing limit reached. Reopen and filter by title or path.');
    for (const document of documents)
      if (!session.offered.has(document.path)) session.offered.set(document.path, document);
    return { documents, total: filtered.length, offset: start, pageSize: COMPOSER_PAGE_SIZE };
  }
  async commit(id: string, vaultId: string, paths: string[]) {
    const session = await this.session(id);
    if (
      vaultId !== session.vaultId ||
      paths.length < 1 ||
      paths.length > MAX_SELECTED_DOCUMENTS ||
      new Set(paths).size !== paths.length
    )
      throw new Error('Invalid document selection');
    const choices = paths.map((path) => {
      const choice = session.offered.get(path);
      if (!choice) throw new Error('Choose documents offered by this picker');
      return choice;
    });
    return this.service.selectedContext(vaultId, choices, session.scope.revision);
  }
  close(id: string) {
    this.sessions.delete(id);
  }
  async dispatch(input: unknown) {
    const { action, sessionId, vaultId, query, offset, paths } = composerActionSchema.parse(input);
    if (action === 'close') {
      this.close(sessionId);
      return { closed: true };
    }
    if (!vaultId) throw new Error('Choose a vault first');
    return action === 'browse'
      ? this.browse(sessionId, vaultId, query, offset)
      : this.commit(sessionId, vaultId, paths);
  }
}
