/** Future adapters must enforce policy before returning content or graph metadata. */
export interface RhenPolicyProvider {
  revision(): Promise<string>;
  isDenied(vaultRelativePath: string): Promise<boolean>;
}
export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  readonly locality: 'local' | 'remote';
  embed(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
}
export interface ChangeEvent {
  workspaceId: string;
  vaultId: string;
  path: string;
  kind: 'upsert' | 'delete' | 'rename' | 'policy';
  revision: string;
  oldPath?: string;
}
