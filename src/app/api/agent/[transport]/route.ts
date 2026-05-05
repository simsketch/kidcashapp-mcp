import { createMcpHandler } from 'mcp-handler';
import { registerAllTools } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = createMcpHandler(
  registerAllTools,
  {
    serverInfo: {
      name: 'kidcash',
      version: '1.0.0',
    },
    capabilities: {
      tools: {},
    },
  },
  {
    basePath: '/api/agent',
    maxDuration: 60,
    verboseLogs: false,
  },
);

export { handler as GET, handler as POST };
