import { lstat, realpath, open, readdir } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { notePath } from '@obsidian-integrated/core';

export async function safePath(
  root: string,
  path: string,
  allowMissingLeaf = false,
): Promise<string> {
  notePath(path);
  const canonicalRoot = await realpath(root);
  if (canonicalRoot !== root)
    throw new Error('Vault root changed; register its canonical path again');
  let current = root;
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]!);
    try {
      const info = await lstat(current);
      if (
        info.isSymbolicLink() ||
        (!info.isDirectory() && !info.isFile()) ||
        (info.isFile() && info.nlink > 1)
      )
        throw new Error('Linked paths are unavailable');
      const resolved = await realpath(current),
        rel = relative(root, resolved);
      if (rel.startsWith('..') || isAbsolute(rel))
        throw new Error('Path escapes its registered vault');
    } catch (error) {
      if (
        allowMissingLeaf &&
        i === parts.length - 1 &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      )
        return current;
      throw error;
    }
  }
  return current;
}
export async function readNoteFile(root: string, path: string): Promise<string> {
  const filename = await safePath(root, path);
  const file = await open(filename, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink > 1 || info.size > 1_000_000)
      throw new Error('Unsupported note size or file type');
    const data = Buffer.alloc(Math.min(info.size + 1, 1_000_001));
    let bytesRead = 0;
    while (bytesRead < data.length) {
      const result = await file.read(data, bytesRead, data.length - bytesRead, bytesRead);
      if (!result.bytesRead) break;
      bytesRead += result.bytesRead;
    }
    const after = await file.stat();
    if (
      bytesRead > 1_000_000 ||
      after.size !== info.size ||
      after.mtimeMs !== info.mtimeMs ||
      bytesRead !== info.size
    )
      throw new Error('Note changed during read; retry');
    // Revalidate path after open. OS isolation is still required against hostile same-user races.
    await safePath(root, path);
    return data.subarray(0, bytesRead).toString('utf8');
  } finally {
    await file.close();
  }
}
export async function listMarkdown(root: string): Promise<string[]> {
  const found: string[] = [];
  let visited = 0;
  async function visit(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > 40) throw new Error('Vault nesting limit exceeded');
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (++visited > 30000) throw new Error('Vault entry limit exceeded; use a smaller vault');
      if (item.name.startsWith('.') || item.isSymbolicLink()) continue;
      const path = prefix + item.name;
      if (item.isDirectory()) {
        await safePath(root, path);
        await visit(join(dir, item.name), path + '/', depth + 1);
      } else if (item.isFile() && item.name.toLowerCase().endsWith('.md')) found.push(path);
    }
  }
  await visit(root, '', 0);
  return found.sort();
}
