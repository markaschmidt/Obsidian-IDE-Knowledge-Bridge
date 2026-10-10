import type { Note, Chunk } from './markdown.js';
import type { WorkspaceProfile } from './config.js';

export interface SearchHit extends Chunk {
  noteId: string;
  vaultId: string;
  path: string;
  title: string;
  revision: string;
  score: number;
  reason: 'lexical' | 'linked';
  uri: string;
}
const terms = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
function collapse(path: string): string | undefined {
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '..') {
      if (!parts.length) return;
      parts.pop();
    } else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}
export function resolveLink(source: Note, raw: string, notes: readonly Note[]): Note | undefined {
  let target: string;
  try {
    target = decodeURIComponent(raw.split('#')[0]!.split('?')[0]!);
  } catch {
    return;
  }
  if (!target) return source;
  if (/^[a-z][a-z\d+.-]*:|^\//i.test(target)) return;
  if (!target.toLowerCase().endsWith('.md')) target += '.md';
  const candidates = notes.filter((n) => n.vaultId === source.vaultId);
  const parent = source.path.includes('/')
    ? source.path.slice(0, source.path.lastIndexOf('/') + 1)
    : '';
  for (const path of [collapse(parent + target), collapse(target)]) {
    const exact = candidates.filter((n) => n.path.toLowerCase() === path?.toLowerCase());
    if (exact.length === 1) return exact[0];
  }
  const stem = target.replace(/\.md$/i, '').toLowerCase();
  const matches = candidates.filter(
    (n) =>
      n.path.split('/').pop()!.toLowerCase() === target.toLowerCase() ||
      n.aliases.some((a) => a.toLowerCase() === stem),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function graph(notes: readonly Note[]): Map<string, Set<string>> {
  const edges = new Map(notes.map((n) => [n.id, new Set<string>()]));
  for (const note of notes)
    for (const link of note.links) {
      const target = resolveLink(note, link, notes);
      if (target && target.id !== note.id) edges.get(note.id)!.add(target.id);
    }
  return edges;
}
export function search(
  notes: readonly Note[],
  query: string,
  settings: WorkspaceProfile['retrieval'],
): SearchHit[] {
  const queryTerms = [...new Set(terms(query))].slice(0, 64);
  if (!queryTerms.length) return [];
  const docs = notes.flatMap((note) =>
    note.chunks.map((chunk) => ({
      note,
      chunk,
      tokens: terms(`${note.title} ${note.aliases.join(' ')} ${chunk.heading} ${chunk.text}`),
    })),
  );
  const average = docs.reduce((sum, d) => sum + d.tokens.length, 0) / (docs.length || 1);
  const frequencies = new Map(
    queryTerms.map((t) => [t, docs.filter((d) => d.tokens.includes(t)).length]),
  );
  const hit = (
    note: Note,
    chunk: Chunk,
    score: number,
    reason: SearchHit['reason'],
  ): SearchHit => ({
    ...chunk,
    noteId: note.id,
    vaultId: note.vaultId,
    path: note.path,
    title: note.title,
    revision: note.revision,
    score,
    reason,
    uri: `obsidian-integrated://note/${encodeURIComponent(note.vaultId)}/${note.path.split('/').map(encodeURIComponent).join('/')}#L${chunk.startLine}`,
  });
  const ranked: SearchHit[] = [];
  for (const d of docs) {
    let score = 0;
    for (const term of queryTerms) {
      const tf = d.tokens.filter((t) => t === term).length;
      const df = frequencies.get(term)!;
      if (tf)
        score +=
          (Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)) * (tf * 2.2)) /
          (tf + 1.2 * (0.25 + (0.75 * d.tokens.length) / average));
    }
    if (score > 0) ranked.push(hit(d.note, d.chunk, score, 'lexical'));
  }
  ranked.sort(
    (a, b) => b.score - a.score || a.noteId.localeCompare(b.noteId) || a.startLine - b.startLine,
  );
  const selected: SearchHit[] = [],
    seen = new Set<string>();
  let size = 0;
  const add = (h: SearchHit) => {
    const key = `${h.noteId}:${h.startLine}:${h.text}`;
    if (seen.has(key) || selected.length >= settings.maxResults || size >= settings.maxChars)
      return;
    const remaining = settings.maxChars - size;
    selected.push({ ...h, text: h.text.slice(0, remaining) });
    size += Math.min(remaining, h.text.length);
    seen.add(key);
  };
  const lexicalLimit = settings.graphHops
    ? Math.max(1, Math.ceil(settings.maxResults * 0.75))
    : settings.maxResults;
  for (const h of ranked.slice(0, lexicalLimit)) add(h);
  if (settings.graphHops) {
    const edges = graph(notes),
      seedIds = new Set(selected.map((h) => h.noteId));
    for (const note of notes) {
      const related = [...seedIds].some(
        (id) => edges.get(id)?.has(note.id) || edges.get(note.id)?.has(id),
      );
      if (related && !seedIds.has(note.id) && note.chunks[0])
        add(hit(note, note.chunks[0], 0, 'linked'));
    }
  }
  for (const h of ranked) add(h);
  return selected;
}
