import * as vscode from 'vscode';
import { pickDocuments, type DocumentPicker } from '@knowledge-bridge/core';
import type { KnowledgeService } from '@knowledge-bridge/core/service';

const nativePicker: DocumentPicker = {
  async chooseVault(vaults) {
    const selected = await vscode.window.showQuickPick(
      vaults.map((v) => ({ label: v.name, description: v.id, id: v.id })),
      { title: 'Obsidian: choose a scoped vault', ignoreFocusOut: true },
    );
    return selected?.id;
  },
  async chooseDocuments(page) {
    if (!page.documents.length) {
      const filter = await vscode.window.showInputBox({
        title: 'No matching notes. Change or clear the title/path filter.',
        value: page.filter,
      });
      return filter === undefined ? undefined : { paths: [], action: 'filter', filter };
    }
    const selected = await vscode.window.showQuickPick(
      page.documents.map((d) => ({
        label: d.title,
        description: d.path,
        path: d.path,
        picked: page.selectedOnPage.includes(d.path),
      })),
      {
        title: `Obsidian: ${page.vault.name} · page ${page.page + 1}/${page.pageCount}`,
        placeHolder: 'Choose documents to copy for this chat',
        canPickMany: true,
        ignoreFocusOut: true,
      },
    );
    if (selected === undefined) return;
    const paths = selected.map((d) => d.path);
    if (!page.canNavigate) return { paths, action: 'attach' };
    const next = await vscode.window.showQuickPick(
      [
        { label: 'Copy selected documents', action: 'attach' as const },
        { label: 'Next page', action: 'next' as const },
        { label: 'Previous page', action: 'previous' as const },
        { label: 'Filter by title or path', action: 'filter' as const },
      ],
      { title: 'Obsidian document selection' },
    );
    if (!next) return;
    if (next.action !== 'filter') return { paths, action: next.action };
    const filter = await vscode.window.showInputBox({
      title: 'Filter note titles or paths',
      value: page.filter,
    });
    return filter === undefined ? undefined : { paths, action: 'filter', filter };
  },
};

export async function copyDocumentsForChat(service: KnowledgeService): Promise<void> {
  const selection = await pickDocuments(service, nativePicker);
  if (selection.status !== 'selected') {
    if (selection.status === 'empty') void vscode.window.showInformationMessage(selection.message);
    return;
  }
  const bundle = await service.selectedContext(
    selection.vaultId,
    selection.documents,
    selection.scopeRevision,
  );
  await vscode.env.clipboard.writeText(JSON.stringify(bundle, null, 2));
  void vscode.window.showInformationMessage(
    `Copied ${bundle.documents.length} Obsidian document(s). Paste into the current chat.${bundle.documents.some((d) => d.truncated) ? ' Some documents were truncated to the workspace context budget.' : ''}`,
  );
}
