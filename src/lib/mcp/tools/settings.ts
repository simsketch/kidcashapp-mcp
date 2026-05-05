import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSettings } from '@/lib/db/settings';
import { withAuth } from '@/lib/mcp/auth';

export function registerSettingsTools(server: McpServer) {
  server.registerTool(
    'get_settings',
    {
      title: 'Get account settings',
      description:
        'Read the authenticated account\'s settings: currency, currency symbol, family surname, theme, and feature toggles. Use to format amounts ("$10" vs "£10") or check whether features like wishlist age display are on.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    withAuth(async (userId) => {
      return getSettings(userId);
    }),
  );
}
