import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KnowledgeService } from '@obsidian-integrated/local-service';
import { createServer } from './server.js';

function option(name: string): string {
  const index = process.argv.indexOf(name),
    value = process.argv[index + 1];
  if (index < 0 || !value || value.startsWith('--')) throw new Error(`Missing ${name}`);
  return value;
}
try {
  const service = new KnowledgeService(option('--registry'), option('--profile'));
  await service.status();
  await createServer(service).connect(new StdioServerTransport());
} catch (error) {
  // stdout belongs exclusively to the MCP transport.
  console.error(error instanceof Error ? error.message : 'Startup failed');
  process.exitCode = 1;
}
