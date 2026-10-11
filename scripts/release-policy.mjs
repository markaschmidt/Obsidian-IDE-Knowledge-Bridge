const CONVENTIONAL =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([A-Za-z0-9./_-]+\))?(!)?: [^ ].+$/;
const PROMOTE = /^promote: [^ ].+$/;

export function titleAccepted(title, base) {
  const value = title.trim();
  if (base === 'main') return PROMOTE.test(value);
  return CONVENTIONAL.test(value);
}

export function titleHint(base) {
  if (base === 'main') {
    return 'Pull requests into main must use a title like "promote: describe the release". Add "[skip release]" only when the promotion must not publish.';
  }
  return 'Pull requests into staging must use a Conventional Commit title, for example "feat: add workspace search" or "fix(chat): keep the selected vault".';
}

export function nextVersion(current, messages) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Release version must be major.minor.patch, received ${current}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const rank = messages.reduce((highest, message) => Math.max(highest, bumpRank(message)), 1);
  if (rank === 3) return `${major + 1}.0.0`;
  if (rank === 2) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function splitCommitRecords(input) {
  return input
    .split('\u001e')
    .map((record) => record.trim())
    .filter(Boolean);
}

export function isAlreadyPublished(output) {
  return /already exists|version already|already been published|cannot publish over|published extension version/i.test(
    output,
  );
}

function bumpRank(message) {
  const subject = message.trim().split(/\r?\n/, 1)[0] ?? '';
  if (/^[A-Za-z]+(\([^)]+\))?!:/.test(subject) || message.includes('BREAKING CHANGE')) return 3;
  if (/^feat(\(|!|:)/.test(subject)) return 2;
  return 1;
}

export function replaceFirstVersion(source, version) {
  const replaced = source.replace(/"version": "[^"]+"/, `"version": "${version}"`);
  if (replaced === source) throw new Error('Package version field was not found');
  return replaced;
}

export function replaceVersionAfter(source, marker, version) {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Version marker was not found: ${marker}`);
  const tail = source.slice(index);
  const replaced = tail.replace(/"version": "[^"]+"/, `"version": "${version}"`);
  if (replaced === tail) throw new Error(`No version field follows marker: ${marker}`);
  return source.slice(0, index) + replaced;
}

export const lockfileVersionMarkers = [
  '"name": "obsidian-ide-knowledge-bridge"',
  '"": {\n      "name": "obsidian-ide-knowledge-bridge"',
  '"apps/mcp-server": {\n      "name": "@obsidian-integrated/mcp-server"',
  '"apps/vscode-extension": {\n      "name": "obsidian-integrated"',
];
