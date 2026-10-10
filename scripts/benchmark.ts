import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../tests/helpers.js';
const f = await fixture();
try {
  for (let i = 0; i < 200; i++)
    await writeFile(
      join(f.vault, 'Project', `Note-${i}.md`),
      `# Note ${i}\n${'A synthetic retrieval note with scoped context. '.repeat(20)}\n[[Architecture]]`,
    );
  const times = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    await f.service.search('retrieval');
    times.push(Math.round(performance.now() - start));
  }
  console.log(
    JSON.stringify(
      {
        dataset: '202 synthetic in-scope notes; ~180 KB',
        coldMs: times[0],
        warmMs: times.slice(1),
        note: 'Local baseline, not a production latency guarantee. Full file validation occurs on every query.',
      },
      null,
      2,
    ),
  );
} finally {
  await f.clean();
}
