import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getKidBySlugLite } from '@/lib/db/kids';
import { createTransaction, transferBetweenAccounts } from '@/lib/db/transactions';
import { withAuth } from '@/lib/mcp/auth';

const accountEnum = z.enum(['checking', 'savings', 'charity']);

const amountSchema = z
  .number()
  .positive()
  .max(10_000)
  .describe(
    'Dollar amount, positive number. Sanity cap of $10,000 per transaction — anything larger almost certainly means the user said something unusual; ask them to confirm before retrying with a higher amount.',
  );

const noteSchema = z
  .string()
  .min(1)
  .max(200)
  .describe('Short human-readable reason, e.g. "chores" or "good behavior".');

export function registerTransactionTools(server: McpServer) {
  server.registerTool(
    'add_money',
    {
      title: 'Add money to a kid',
      description:
        'Credit a kid\'s balance. Use this for chore payments, allowances, gifts, or any positive deposit. Returns the new balance.',
      inputSchema: {
        kidSlug: z.string().min(1).describe('Kid slug from list_kids.'),
        amount: amountSchema,
        note: noteSchema,
        account: accountEnum
          .optional()
          .default('checking')
          .describe('Which account to credit. Defaults to checking.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { kidSlug, amount, note, account }: {
      kidSlug: string;
      amount: number;
      note: string;
      account?: 'checking' | 'savings' | 'charity';
    }) => {
      const kid = await getKidBySlugLite(kidSlug, userId);
      if (!kid) throw new Error(`No kid named "${kidSlug}"`);
      const result = await createTransaction(
        kid.id,
        amount,
        'credit',
        note,
        userId,
        account ?? 'checking',
      );
      return {
        kidSlug,
        added: amount,
        note,
        account: account ?? 'checking',
        newBalance: result.newBalance,
      };
    }),
  );

  server.registerTool(
    'subtract_money',
    {
      title: 'Subtract money from a kid',
      description:
        'Debit a kid\'s balance. Use for purchases, fines, or any negative transaction. Returns the new balance. Note is required so the kid sees why money was deducted.',
      inputSchema: {
        kidSlug: z.string().min(1).describe('Kid slug from list_kids.'),
        amount: amountSchema,
        note: noteSchema,
        account: accountEnum
          .optional()
          .default('checking')
          .describe('Which account to debit. Defaults to checking.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { kidSlug, amount, note, account }: {
      kidSlug: string;
      amount: number;
      note: string;
      account?: 'checking' | 'savings' | 'charity';
    }) => {
      const kid = await getKidBySlugLite(kidSlug, userId);
      if (!kid) throw new Error(`No kid named "${kidSlug}"`);
      const result = await createTransaction(
        kid.id,
        amount,
        'debit',
        note,
        userId,
        account ?? 'checking',
      );
      return {
        kidSlug,
        subtracted: amount,
        note,
        account: account ?? 'checking',
        newBalance: result.newBalance,
      };
    }),
  );

  server.registerTool(
    'transfer_between_accounts',
    {
      title: 'Transfer between a kid\'s accounts',
      description:
        'Move money between a single kid\'s checking, savings, or charity accounts. Both accounts belong to the same kid — this is not a transfer between kids. Requires the kid to have separateAccounts enabled (or charityEnabled for charity transfers).',
      inputSchema: {
        kidSlug: z.string().min(1).describe('Kid slug from list_kids.'),
        amount: amountSchema,
        from: accountEnum.describe('Account to move money from.'),
        to: accountEnum.describe('Account to move money to. Must differ from "from".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { kidSlug, amount, from, to }: {
      kidSlug: string;
      amount: number;
      from: 'checking' | 'savings' | 'charity';
      to: 'checking' | 'savings' | 'charity';
    }) => {
      const kid = await getKidBySlugLite(kidSlug, userId);
      if (!kid) throw new Error(`No kid named "${kidSlug}"`);
      const balances = await transferBetweenAccounts(kid.id, amount, from, to, userId);
      return {
        kidSlug,
        moved: amount,
        from,
        to,
        ...balances,
      };
    }),
  );

  server.registerTool(
    'get_transactions',
    {
      title: 'Get transaction history for a kid',
      description:
        'Read a kid\'s recent transactions, optionally filtered to a date window. Use this to summarize spending, find a specific past transaction, or compute trends. Returns transactions newest-first.',
      inputSchema: {
        kidSlug: z.string().min(1).describe('Kid slug from list_kids.'),
        sinceDate: z
          .string()
          .optional()
          .describe('ISO date (YYYY-MM-DD) — only return transactions on or after this date.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .default(50)
          .describe('Max transactions to return. Default 50.'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    withAuth(async (userId, { kidSlug, sinceDate, limit }: {
      kidSlug: string;
      sinceDate?: string;
      limit?: number;
    }) => {
      const { getKidBySlug } = await import('@/lib/db/kids');
      const kid = await getKidBySlug(kidSlug, userId);
      if (!kid) throw new Error(`No kid named "${kidSlug}"`);

      const cap = limit ?? 50;
      const cutoff = sinceDate ? new Date(sinceDate).getTime() : 0;
      const filtered = kid.transactions
        .filter((t) => !cutoff || new Date(t.date).getTime() >= cutoff)
        .slice(0, cap);

      return {
        kidSlug,
        kidName: kid.name,
        count: filtered.length,
        transactions: filtered,
      };
    }),
  );
}
