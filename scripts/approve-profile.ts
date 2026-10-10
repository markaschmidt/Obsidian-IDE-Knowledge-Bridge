import { resolve } from 'node:path';
import { approveProfile, readProfile } from '@knowledge-bridge/core/service';
const [registry, profile] = process.argv.slice(2);
if (!registry || !profile)
  throw new Error('Usage: approve-profile.ts <registry.json> <workspace.json>');
const parsed = await readProfile(resolve(profile));
await approveProfile(resolve(registry), resolve(profile));
console.log(
  `Approved ${parsed.name} (${parsed.workspaceId}) with ${parsed.scopes.length} vault scope(s).`,
);
