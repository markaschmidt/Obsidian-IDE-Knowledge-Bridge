import type * as vscode from 'vscode';
export interface CursorMcp {
  registerServer(config: {
    name: string;
    server: { command: string; args: string[]; env: Record<string, string> };
  }): void;
  unregisterServer(name: string): void;
}
export function cursorMcp(api: typeof vscode): CursorMcp | undefined {
  const candidate = (api as unknown as { cursor?: { mcp?: CursorMcp } }).cursor?.mcp;
  return typeof candidate?.registerServer === 'function' &&
    typeof candidate?.unregisterServer === 'function'
    ? candidate
    : undefined;
}
