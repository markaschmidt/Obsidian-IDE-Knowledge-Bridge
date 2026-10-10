import { readFile, realpath, lstat } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import type { RhenPolicyProvider } from '@obsidian-integrated/core';

export function isSealed(text: string): boolean {
  return /^\uFEFF?(?:SLATE|RHEN)\d+:/.test(text.trimStart());
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fold = (value: string) =>
  value
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();

/** Compatibility reader, independently implemented. Never imports Rhen code or reads keys. */
export async function readRhenPolicy(
  root: string,
  mode: 'auto' | 'required',
): Promise<RhenPolicyProvider> {
  try {
    await lstat(join(root, '.obsidian', 'plugins', 'slate-infosec'));
    throw new Error(
      'Legacy Slate installation detected; migrate to Rhen before connecting this vault',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const plugin = join(root, '.obsidian', 'plugins', 'rhen-info-vault');
  try {
    await lstat(plugin);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (mode === 'required') throw new Error('Required Rhen installation is unavailable');
    return { revision: async () => 'absent', isDenied: async () => false };
  }
  const target = join(plugin, 'data.json');
  const canonical = await realpath(target);
  const rel = relative(root, canonical);
  if (rel.startsWith('..') || isAbsolute(rel) || canonical !== target)
    throw new Error('Rhen policy path must not contain links');
  const info = await lstat(target);
  if (info.size > 2_000_000 || info.nlink > 1) throw new Error('Unsupported Rhen policy file');
  const raw = await readFile(target, 'utf8');
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('Rhen policy unavailable');
  const rules = data as Record<string, unknown>;
  for (const field of ['lockedFiles', 'lockedFolders']) {
    if (
      !Array.isArray(rules[field]) ||
      !(rules[field] as unknown[]).every((p) => typeof p === 'string')
    )
      throw new Error('Unsupported Rhen policy format');
  }
  const files = new Set((rules.lockedFiles as string[]).map(fold));
  const folders = (rules.lockedFolders as string[]).map(fold);
  const policyRevision = hash(raw);
  // Conservatively retain folder denials, even when Rhen contains an unlock exception.
  // Authenticating declassification requires a future supported Rhen policy API.
  return {
    revision: async () => policyRevision,
    isDenied: async (path) => {
      const key = fold(path);
      return (
        files.has(key) ||
        folders.some((folder) => !folder || key === folder || key.startsWith(folder + '/'))
      );
    },
  };
}
