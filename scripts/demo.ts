import { fixture } from '../tests/helpers.js';
const f = await fixture();
try {
  console.log(
    'Synthetic workspace search:',
    JSON.stringify(await f.service.search('retrieval'), null, 2),
  );
  console.log(
    'Capture:',
    await f.service.capture({
      vaultId: 'notes',
      requestId: 'demo',
      title: 'Session handoff',
      content: 'Reuse the [[Architecture]] decision next session.',
      source: 'mcp',
    }),
  );
  console.log('Scoped backlinks:', await f.service.neighbors('notes', 'Project/Architecture.md'));
} finally {
  await f.clean();
}
