import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY ?? 'markaschmidt/Obsidian-IDE-Knowledge-Bridge';

function gh(args, input) {
  const result = spawnSync('gh', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  return result.stdout;
}

const existing = JSON.parse(gh(['api', `repos/${repo}/rulesets`, '--paginate']));
for (const name of ['staging', 'main']) {
  const body = await readFile(new URL(`../.github/rulesets/${name}.json`, import.meta.url));
  const current = existing.find((ruleset) => ruleset.name === name);
  if (current) {
    gh(['api', '--method', 'PUT', `repos/${repo}/rulesets/${current.id}`, '--input', '-'], body);
    console.log(`Updated ${name} ruleset ${current.id}`);
  } else {
    gh(['api', '--method', 'POST', `repos/${repo}/rulesets`, '--input', '-'], body);
    console.log(`Created ${name} ruleset`);
  }
}
