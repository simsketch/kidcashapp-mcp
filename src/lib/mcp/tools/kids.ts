import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getKids, getKidBySlug } from '@/lib/db/kids';
import { withAuth } from '@/lib/mcp/auth';

export function registerKidTools(server: McpServer) {
  server.registerTool(
    'list_kids',
    {
      title: 'List kids',
      description:
        'List every kid on the authenticated KidCash account with their current balances. Use this first whenever the user mentions a kid by name so you can match them to a slug.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    withAuth(async (userId) => {
      const kids = await getKids(userId);
      return kids.map((k) => ({
        slug: k.slug,
        name: k.name,
        avatar: k.avatar,
        balance: k.balance,
        checkingBalance: k.checkingBalance,
        savingsBalance: k.savingsBalance,
        charityBalance: k.charityBalance,
        separateAccounts: k.separateAccounts,
        charityEnabled: k.charityEnabled,
      }));
    }),
  );

  server.registerTool(
    'get_kid',
    {
      title: 'Get kid detail',
      description:
        'Fetch one kid by slug, including their wishlist (savingsGoals), recurring allowance, and recent transactions. Slugs are kebab-case and stable; get them from list_kids.',
      inputSchema: {
        slug: z
          .string()
          .min(1)
          .describe('The kid\'s slug, e.g. "rafi" or "amiel-junior". Get from list_kids.'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { slug }: { slug: string }) => {
      const kid = await getKidBySlug(slug, userId);
      if (!kid) throw new Error(`No kid named "${slug}" on this account`);
      return kid;
    }),
  );
}
