---
name: knowledge-bridge-marketplace
description: >-
  Publish Obsidian IDE Knowledge Bridge to the Visual Studio Marketplace and
  Open VSX, and verify the listing is actually public. Use when publishing the
  extension, debugging a Marketplace 404, creating the MarkaSchmidt publisher,
  or setting VSCE_PAT or OVSX_PAT.
---

# Knowledge Bridge marketplace

The extension id is `markaschmidt.obsidian-integrated`. The Marketplace publisher's stored name is `MarkaSchmidt`. The gallery matches that name case-insensitively. `package.json` keeps `"publisher": "markaschmidt"`. Do not rename it.

Version 0.5.0 is the first public Marketplace release: [the listing](https://marketplace.visualstudio.com/items?itemName=MarkaSchmidt.obsidian-integrated).

## What a successful upload looks like

`vsce` prints `DONE Published` even when the publisher does not exist. `getExtension` returns null, `createExtension` does not fail the command, and the public page stays a 404. Treat that message as untrusted until the checks below pass.

1. The publisher exists. Create it in the browser at https://marketplace.visualstudio.com/manage while signed into the Microsoft account that owns the Azure DevOps token. The command line cannot create it. The ID cannot be changed later. Deleting it reserves the ID forever, so a new account cannot reuse `MarkaSchmidt`. Add a corporate Microsoft account as a publisher member instead of deleting and recreating.
2. This Azure DevOps organization is not the publisher: `markaaronschmidt`. A Marketplace token needs **All accessible organizations** and **Marketplace (Manage)**. Store it as `VSCE_PAT` in the GitHub environment `marketplace`. Never commit it.
3. After upload, the VS Code catalog must return the version with `validated` flags:

`https://marketplace.visualstudio.com/_apis/public/gallery/vscode/markaschmidt/obsidian-integrated/latest`

The mixed-case `/vscode/MarkaSchmidt/...` path can 404 while the lowercase path is the one that is live. The HTML item page can lag the API. Confirm it returns the extension title before sending the link:

`https://marketplace.visualstudio.com/items?itemName=MarkaSchmidt.obsidian-integrated`

## Cursor

Cursor searches Open VSX, not the Visual Studio Marketplace. Publishing there needs `OVSX_PAT` in the same GitHub environment. An Azure DevOps token cannot publish to Open VSX. Create the Open VSX token from an account signed in with GitHub, under the `markaschmidt` namespace. Until that secret exists, a `promote:` merge fails before it bumps the version.
