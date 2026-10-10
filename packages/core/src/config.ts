import { z } from 'zod';
import picomatch from 'picomatch';

export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
export function notePath(value: string): string {
  if (!value || value.length > 1000 || /[\\:\x00-\x1f]/.test(value) || value.startsWith('/'))
    throw new Error('Expected a vault-relative POSIX path');
  if (
    value
      .split('/')
      .some(
        (p) =>
          !p || p === '.' || p === '..' || p.endsWith('.') || p.endsWith(' ') || /[<>"|?*]/.test(p),
      )
  )
    throw new Error('Invalid note path');
  if (
    value
      .split('/')
      .some((p) => p.startsWith('.') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))
  )
    throw new Error('Hidden or reserved paths are unavailable');
  return value;
}
const relativePath = z.string().refine((value) => {
  try {
    notePath(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid vault-relative path');
const glob = z
  .string()
  .min(1)
  .max(250)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.includes('\\') &&
      !p.includes(':') &&
      !p.split('/').includes('..') &&
      !p.startsWith('!'),
    'Invalid scope glob',
  );
export const scopeSchema = z
  .object({
    vaultId: idSchema,
    include: z.array(glob).min(1).max(30),
    exclude: z.array(glob).max(30).default([]),
    tagsAny: z.array(z.string().min(1).max(100)).max(30).default([]),
    captureFolder: relativePath.optional(),
  })
  .strict();
export const profileSchema = z
  .object({
    version: z.literal(1),
    workspaceId: idSchema,
    name: z.string().min(1).max(100),
    scopes: z.array(scopeSchema).max(30),
    retrieval: z
      .object({
        maxResults: z.number().int().min(1).max(30).default(8),
        maxChars: z.number().int().min(500).max(40000).default(12000),
        graphHops: z.union([z.literal(0), z.literal(1)]).default(1),
      })
      .strict()
      .default({}),
  })
  .strict()
  .refine(
    (p) => new Set(p.scopes.map((s) => s.vaultId)).size === p.scopes.length,
    'A vault can occur only once in a profile',
  );
export const vaultSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(100),
    root: z.string().min(1),
    rhen: z.enum(['auto', 'required']).default('auto'),
  })
  .strict();
export const registrySchema = z
  .object({
    version: z.literal(1),
    vaults: z.array(vaultSchema),
    approvals: z.record(z.string(), z.string()).default({}),
  })
  .strict()
  .refine(
    (r) => new Set(r.vaults.map((v) => v.id)).size === r.vaults.length,
    'Duplicate vault IDs',
  );
export type WorkspaceProfile = z.infer<typeof profileSchema>;
export type VaultRegistration = z.infer<typeof vaultSchema>;
export type Registry = z.infer<typeof registrySchema>;
export type VaultScope = z.infer<typeof scopeSchema>;
export function pathInScope(path: string, scope: VaultScope): boolean {
  try {
    notePath(path);
  } catch {
    return false;
  }
  const options = { nocase: true, dot: false };
  return (
    path.toLowerCase().endsWith('.md') &&
    picomatch(scope.include, options)(path) &&
    !picomatch(scope.exclude, options)(path)
  );
}
export const emptyRegistry = (): Registry => ({ version: 1, vaults: [], approvals: {} });
