import { fromMarkdown } from 'mdast-util-from-markdown';
import { parse } from 'yaml';

export interface Note {
  id: string;
  vaultId: string;
  path: string;
  title: string;
  aliases: string[];
  tags: string[];
  text: string;
  revision: string;
  links: string[];
  chunks: Chunk[];
}
export interface Chunk {
  text: string;
  heading: string;
  startLine: number;
  endLine: number;
}
export function parseNote(vaultId: string, path: string, text: string, revision: string): Note {
  const lines = text.split('\n');
  let bodyStart = 0;
  let data: Record<string, unknown> = {};
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (end > 0) {
      const parsed: unknown = parse(lines.slice(1, end).join('\n'), { maxAliasCount: 0 });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        data = parsed as Record<string, unknown>;
      bodyStart = end + 1;
    }
  }
  const list = (value: unknown): string[] =>
    (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter(
      (s): s is string => typeof s === 'string',
    );
  const links = new Set<string>();
  const inlineTags = new Set<string>();
  const body = lines.slice(bodyStart).join('\n');
  const tree = fromMarkdown(body);
  function walk(node: { type: string; value?: string; url?: string; children?: unknown[] }): void {
    if (node.type === 'code' || node.type === 'inlineCode') return;
    if (node.type === 'link' || node.type === 'image') {
      if (node.url && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(node.url)) links.add(node.url);
    }
    if (node.type === 'text' && node.value) {
      for (const match of node.value.matchAll(/\[\[([^\]\n]+)\]\]/g))
        links.add(match[1]!.split('|')[0]!);
      for (const match of node.value.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu))
        inlineTags.add(match[1]!);
    }
    for (const child of node.children ?? []) walk(child as Parameters<typeof walk>[0]);
  }
  walk(tree);
  const chunks: Chunk[] = [];
  let heading = '',
    start = bodyStart,
    buffer = '';
  const flush = (end: number) => {
    if (buffer.trim()) chunks.push({ text: buffer, heading, startLine: start + 1, endLine: end });
    buffer = '';
    start = end;
  };
  let fenced = false;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const h = !fenced ? /^#{1,6}\s+(.+)$/.exec(line) : null;
    if (h || buffer.length + line.length > 1800) flush(i);
    if (h) heading = h[1]!;
    // Bound even pathological one-line notes, retaining their original line citation.
    for (let offset = 0; offset < Math.max(line.length, 1); offset += 1800) {
      if (offset) {
        flush(i + 1);
        start = i;
      }
      buffer += line.slice(offset, offset + 1800) + '\n';
    }
  }
  flush(lines.length);
  return {
    id: `${vaultId}:${path}`,
    vaultId,
    path,
    title:
      typeof data.title === 'string' ? data.title : path.split('/').pop()!.replace(/\.md$/i, ''),
    aliases: list(data.aliases),
    tags: [...new Set([...list(data.tags).map((t) => t.replace(/^#/, '')), ...inlineTags])],
    text,
    revision,
    links: [...links],
    chunks,
  };
}
