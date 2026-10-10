# Rhen compatibility

Rhen Vault (formerly Slate) is an encryption and access-control plugin, not a knowledge export API. Compatibility was reviewed against the owner's local Rhen Vault 0.5.14 source on 2026-10-10. This repository contains no copied private implementation. Public product/release reference: [Rhen Vault](https://github.com/markaschmidt/Rhen-Vault).

## Verified integration facts

The current plugin ID is `rhen-info-vault`; existing encrypted disk envelopes retain the `SLATE1:` marker. The settings contain locked file/folder paths and unlock exceptions. An unlocked Obsidian session may expose decrypted text through application APIs even though disk remains encrypted. No stable, versioned public agent policy API was identified in the inspected integration surface.

Those facts lead to a conservative adapter: evaluate on-disk policy and read source files through Node, rather than treating an application's decrypted buffer as permission to export. The companion checks the source note through the same service before capturing an editor selection. Sealed bodies never go to the parser, index or model.

## Current behavior

- Default compatibility location: `.obsidian/plugins/rhen-info-vault/data.json` inside a registered vault.
- `auto`: detect Rhen at that location; ordinary plaintext vaults without that installation work.
- `required`: refuse all operations if the installation/policy is missing.
- An installed but unreadable, malformed or unsupported policy fails closed.
- File and folder denials match case-insensitively. Folder denials remain effective even if settings contain unlock exceptions. This intentionally over-restricts until an authenticated declassification contract exists.
- Raw `SLATE1:` and future numbered `SLATE`/`RHEN` envelope markers are rejected independently of settings.
- Policy is reread per operation and checked for changes across the retrieval/capture preparation window. Cached parses are cleared on failures.
- No passphrase requests, decryption, unsealing, OS-account changes, ACL changes, guard-file modifications or Rhen-setting edits are exposed.

**Preview limitation:** custom Obsidian configuration directories and legacy `slate-infosec` installations require explicit migration to the current layout before use; use `required` mode whenever Rhen is expected. A detected legacy `slate-infosec` directory is rejected rather than treated as unprotected. A future adapter must negotiate both ID and policy schema. Do not treat absence of the current plugin directory as proof that a vault has no other protection system.

## Boundaries that remain

The disk settings are not a signed declassification channel. Same-user processes can tamper with local files, and no Node path validation eliminates all hostile filesystem races. Rhen's encryption and separate-account protections remain separate boundaries. A vault stored under another OS account may intentionally be inaccessible; this integration does not bypass that.

Once a note was shared in a prior session, sealing the original cannot recall text from model context or saved summaries. A copied summary is a new document requiring its own policy. This is why automatic transcript capture and persistent vector storage are not enabled in the baseline.

## Proposed supported Rhen contract

Coordinate a public, versioned API before implementing fast incremental indexing:

```ts
interface AgentPolicyV1 {
  version: 1;
  getRevision(): Promise<string>;
  canRead(path: string, purpose: 'retrieve' | 'graph' | 'capture-source'): Promise<boolean>;
  canCreate(path: string): Promise<boolean>;
  onPolicyChanged(listener: (revision: string) => void): () => void;
}
```

This is a proposal, not an API that Rhen currently exports. It should return policy decisions only, never decrypted content or secrets. Authorization must distinguish user-visible unlock from agent-readable declassification. Unknown versions, disconnects and stale revisions deny access. A future write bridge needs a policy check coupled to the actual file mutation to close the check/write race.

Acceptance requires joint tests with Rhen: lock/unlock/rename, folder exceptions, startup reconciliation, external edits, rapid lock during retrieval, Rhen removal, vault moves and policy unavailability. All development fixtures must be synthetic.
