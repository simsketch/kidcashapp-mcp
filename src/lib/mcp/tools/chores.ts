import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPendingCompletions, reviewChoreCompletion } from '@/lib/db/chores';
import { withAuth } from '@/lib/mcp/auth';

export function registerChoreTools(server: McpServer) {
  server.registerTool(
    'list_pending_chores',
    {
      title: 'List pending chore approvals',
      description:
        'Return all chore completions that are waiting for parent approval across every kid. Each item has a completionId you can pass to approve_chore or reject_chore.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    withAuth(async (userId) => {
      const pending = await getPendingCompletions(userId);
      return pending.map((p) => ({
        completionId: p.id,
        choreId: p.choreId,
        kidId: p.kidId,
        choreName: p.choreName,
        choreValue: p.choreValue,
        completedAt: p.completedAt,
      }));
    }),
  );

  server.registerTool(
    'approve_chore',
    {
      title: 'Approve a pending chore',
      description:
        'Mark a kid\'s submitted chore completion as approved. If the chore has a value > 0, this also auto-credits the kid\'s checking balance (note: "Chore: <name>"). Get completionIds from list_pending_chores.',
      inputSchema: {
        completionId: z
          .string()
          .min(1)
          .describe('The completionId from list_pending_chores. NOT the choreId.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { completionId }: { completionId: string }) => {
      const updated = await reviewChoreCompletion(completionId, userId, true);
      return {
        completionId,
        status: updated.status,
        transactionId: updated.transactionId,
        choreName: updated.choreName,
        choreValue: updated.choreValue,
      };
    }),
  );

  server.registerTool(
    'reject_chore',
    {
      title: 'Reject a pending chore',
      description:
        'Mark a kid\'s submitted chore completion as rejected (no money paid out). Use when the chore wasn\'t actually done well or was double-submitted.',
      inputSchema: {
        completionId: z
          .string()
          .min(1)
          .describe('The completionId from list_pending_chores. NOT the choreId.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { completionId }: { completionId: string }) => {
      const updated = await reviewChoreCompletion(completionId, userId, false);
      return {
        completionId,
        status: updated.status,
        choreName: updated.choreName,
      };
    }),
  );
}
