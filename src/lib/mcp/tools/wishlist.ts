import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SavingsGoal } from '@/types';
import { getKidBySlug, updateKid } from '@/lib/db/kids';
import { withAuth } from '@/lib/mcp/auth';

export function registerWishlistTools(server: McpServer) {
  server.registerTool(
    'add_wishlist_item',
    {
      title: 'Add a wishlist item to a kid',
      description:
        'Append a savings goal to a kid\'s wishlist. The item is stamped with createdAt so the "Added X days ago" label shows. Returns the updated wishlist.',
      inputSchema: {
        kidSlug: z.string().min(1).describe('Kid slug from list_kids.'),
        name: z
          .string()
          .min(1)
          .max(100)
          .describe('What the kid is saving for, e.g. "Nintendo Switch" or "Lego set".'),
        target: z
          .number()
          .positive()
          .max(100_000)
          .describe('Target dollar amount.'),
        imageUrl: z
          .string()
          .url()
          .optional()
          .describe('Optional image URL for the goal.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, args: {
      kidSlug: string;
      name: string;
      target: number;
      imageUrl?: string;
    }) => {
      const kid = await getKidBySlug(args.kidSlug, userId);
      if (!kid) throw new Error(`No kid named "${args.kidSlug}"`);

      const newGoal: SavingsGoal = {
        id: randomUUID(),
        name: args.name,
        target: args.target,
        imageUrl: args.imageUrl,
        createdAt: new Date().toISOString(),
      };
      const updatedGoals = [...(kid.savingsGoals ?? []), newGoal];
      await updateKid(args.kidSlug, userId, {
        savingsGoals: updatedGoals,
        savingsGoal: updatedGoals[0] ?? null,
      });

      return {
        kidSlug: args.kidSlug,
        added: newGoal,
        wishlist: updatedGoals,
      };
    }),
  );

  server.registerTool(
    'remove_wishlist_item',
    {
      title: 'Remove a wishlist item from a kid',
      description:
        'Delete a savings goal from a kid\'s wishlist by its id. Get goal ids from get_kid (savingsGoals[].id).',
      inputSchema: {
        kidSlug: z.string().min(1).describe('Kid slug from list_kids.'),
        goalId: z.string().min(1).describe('The savings goal id from get_kid.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { kidSlug, goalId }: { kidSlug: string; goalId: string }) => {
      const kid = await getKidBySlug(kidSlug, userId);
      if (!kid) throw new Error(`No kid named "${kidSlug}"`);

      const before = kid.savingsGoals ?? [];
      const updated = before.filter((g) => g.id !== goalId);
      if (updated.length === before.length) {
        throw new Error(`No wishlist item with id "${goalId}" on ${kid.name}`);
      }

      await updateKid(kidSlug, userId, {
        savingsGoals: updated,
        savingsGoal: updated[0] ?? null,
      });

      return {
        kidSlug,
        removedId: goalId,
        wishlist: updated,
      };
    }),
  );
}
