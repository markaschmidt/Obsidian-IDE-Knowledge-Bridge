import { readFile, mkdir, writeFile, rename, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  profileSchema,
  registrySchema,
  type Registry,
  type WorkspaceProfile,
} from '@obsidian-integrated/core';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const profileDigest = (profile: WorkspaceProfile) =>
  digest(JSON.stringify(profileSchema.parse(profile)));
export async function saveJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(temp, path);
}
export async function readRegistry(path: string): Promise<Registry> {
  return registrySchema.parse(JSON.parse(await readFile(path, 'utf8')));
}
export async function readProfile(path: string): Promise<WorkspaceProfile> {
  return profileSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}
export async function approveProfile(registryPath: string, profilePath: string): Promise<void> {
  const registry = await readRegistry(registryPath),
    profile = await readProfile(profilePath);
  for (const scope of profile.scopes)
    if (!registry.vaults.some((v) => v.id === scope.vaultId))
      throw new Error('Profile references an unregistered vault');
  registry.approvals[await realpath(profilePath)] = profileDigest(profile);
  await saveJson(registryPath, registry);
}
export async function loadApproved(registryPath: string, profilePath: string) {
  const canonical = await realpath(resolve(profilePath));
  const registry = await readRegistry(resolve(registryPath)),
    profile = await readProfile(canonical);
  if (registry.approvals[canonical] !== profileDigest(profile))
    throw new Error(
      'Workspace profile changed or is not approved. Review it in Manage Vaults and Workspace.',
    );
  const bindings = profile.scopes.map((scope) => {
    const vault = registry.vaults.find((v) => v.id === scope.vaultId);
    if (!vault) throw new Error('Unregistered vault');
    return { scope, vault };
  });
  return { registry, profile, bindings };
}
