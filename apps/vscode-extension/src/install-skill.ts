import { mkdir, realpath, lstat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SkillInstallResult {
  path: string;
  status: 'created' | 'unchanged' | 'conflict';
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
    return { path, status: existing === contents ? 'unchanged' : 'conflict' };
  }
}
