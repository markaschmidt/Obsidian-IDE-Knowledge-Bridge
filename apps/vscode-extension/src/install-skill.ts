import { mkdir, realpath, lstat, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const shippedHashes = new Set(['6c08d7073cf81fdb1bf83d0234c86937bfab611db88e3a8a46d4f9d754d2e90c']);
const hash = (contents: string) =>
  createHash('sha256').update(contents.replace(/\r\n/g, '\n')).digest('hex');

export interface SkillInstallResult {
  path: string;
  status: 'created' | 'updated' | 'unchanged' | 'conflict';
}

/** One shared standard skill works in current Cursor and VS Code; never replace user content. */
export async function installWorkspaceSkill(
  workspaceRoot: string,
  contents: string,
): Promise<SkillInstallResult> {
  let directory = await realpath(workspaceRoot);
  for (const part of ['.agents', 'skills', 'obsidian']) {
    directory = join(directory, part);
    await mkdir(directory, { recursive: true });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(directory)) !== directory)
      throw new Error('Cannot install /obsidian through a linked skill directory');
  }
  const path = join(directory, 'SKILL.md');
  try {
    const file = await open(path, 'wx', 0o600);
    try {
      await file.writeFile(contents, 'utf8');
    } finally {
      await file.close();
    }
    return { path, status: 'created' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1)
      throw new Error('Cannot replace a linked skill file');
    const existing = await readFile(path, 'utf8');
    if (hash(existing) === hash(contents)) return { path, status: 'unchanged' };
    if (!shippedHashes.has(hash(existing))) return { path, status: 'conflict' };
    // Only a byte-equivalent shipped skill can migrate. User edits remain intact.
    const temporary = join(directory, `skill-${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(contents, 'utf8');
      } finally {
        await file.close();
      }
      const current = await lstat(path);
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.nlink > 1 ||
        current.ino !== info.ino ||
        current.dev !== info.dev ||
        (await readFile(path, 'utf8')) !== existing
      )
        return { path, status: 'conflict' };
      await rename(temporary, path);
      return { path, status: 'updated' };
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
}
