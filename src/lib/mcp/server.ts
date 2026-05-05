import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerKidTools } from './tools/kids';
import { registerTransactionTools } from './tools/transactions';
import { registerChoreTools } from './tools/chores';
import { registerWishlistTools } from './tools/wishlist';
import { registerSettingsTools } from './tools/settings';

/**
 * Register every KidCash tool on the given MCP server. Called once per
 * incoming MCP connection by the route handler.
 *
 * Tools split by domain so each file stays focused. Adding a new tool means:
 * 1. Add it to the right tools/*.ts file (or create a new one)
 * 2. If you create a new file, register it here.
 */
export function registerAllTools(server: McpServer): void {
  registerKidTools(server);
  registerTransactionTools(server);
  registerChoreTools(server);
  registerWishlistTools(server);
  registerSettingsTools(server);
}
