import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Kid } from '@/types';

// Hoisted mocks must be declared before any imports that use them.
const mocks = vi.hoisted(() => ({
  getUserId: vi.fn<() => Promise<string>>(),
  getKids: vi.fn(),
  getKidBySlug: vi.fn(),
  getKidBySlugLite: vi.fn(),
  updateKid: vi.fn(),
  createTransaction: vi.fn(),
  transferBetweenAccounts: vi.fn(),
  getPendingCompletions: vi.fn(),
  reviewChoreCompletion: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getUserId: mocks.getUserId,
}));
vi.mock('@/lib/db/kids', () => ({
  getKids: mocks.getKids,
  getKidBySlug: mocks.getKidBySlug,
  getKidBySlugLite: mocks.getKidBySlugLite,
  updateKid: mocks.updateKid,
}));
vi.mock('@/lib/db/transactions', () => ({
  createTransaction: mocks.createTransaction,
  transferBetweenAccounts: mocks.transferBetweenAccounts,
}));
vi.mock('@/lib/db/chores', () => ({
  getPendingCompletions: mocks.getPendingCompletions,
  reviewChoreCompletion: mocks.reviewChoreCompletion,
}));
vi.mock('@/lib/db/settings', () => ({
  getSettings: mocks.getSettings,
}));

// Captured tool registrations: name → handler
const tools = new Map<string, {
  config: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}>();

const fakeServer = {
  registerTool: (name: string, config: Record<string, unknown>, handler: (args: unknown) => Promise<unknown>) => {
    tools.set(name, { config, handler });
  },
};

beforeEach(async () => {
  tools.clear();
  vi.clearAllMocks();
  mocks.getUserId.mockResolvedValue('user_test');

  const { registerAllTools } = await import('@/lib/mcp/server');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAllTools(fakeServer as any);
});

function callTool(name: string, args: unknown = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool ${name} was not registered`);
  return tool.handler(args);
}

function textPayload(result: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = result as any;
  expect(r.content[0].type).toBe('text');
  return JSON.parse(r.content[0].text);
}

describe('MCP tool registry', () => {
  it('registers all 12 tools by name', () => {
    expect([...tools.keys()].sort()).toEqual([
      'add_money',
      'add_wishlist_item',
      'approve_chore',
      'get_kid',
      'get_settings',
      'get_transactions',
      'list_kids',
      'list_pending_chores',
      'reject_chore',
      'remove_wishlist_item',
      'subtract_money',
      'transfer_between_accounts',
    ]);
  });

  it('annotates write tools as not-readOnly and read tools as readOnly', () => {
    const reads = ['list_kids', 'get_kid', 'get_settings', 'list_pending_chores', 'get_transactions'];
    const writes = [
      'add_money',
      'subtract_money',
      'transfer_between_accounts',
      'approve_chore',
      'reject_chore',
      'add_wishlist_item',
      'remove_wishlist_item',
    ];
    for (const r of reads) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tools.get(r)!.config as any).annotations.readOnlyHint).toBe(true);
    }
    for (const w of writes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((tools.get(w)!.config as any).annotations.readOnlyHint).toBe(false);
    }
  });

  it('marks reject_chore and remove_wishlist_item as destructive', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((tools.get('reject_chore')!.config as any).annotations.destructiveHint).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((tools.get('remove_wishlist_item')!.config as any).annotations.destructiveHint).toBe(true);
    // Additive writes are explicitly NOT destructive
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((tools.get('add_money')!.config as any).annotations.destructiveHint).toBe(false);
  });
});

describe('auth wrapping', () => {
  it('returns isError result when getUserId throws Unauthorized', async () => {
    mocks.getUserId.mockRejectedValueOnce(new Error('Unauthorized'));
    const result = await callTool('list_kids');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = result as any;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('Unauthorized');
  });
});

describe('list_kids', () => {
  it('passes the resolved userId to the repo', async () => {
    mocks.getKids.mockResolvedValue([
      { slug: 'rafi', name: 'Rafi', avatar: '🧒', balance: 12, checkingBalance: 12, savingsBalance: 0, charityBalance: 0, separateAccounts: false, charityEnabled: false, transactions: [] } as unknown as Kid,
    ]);
    const result = await callTool('list_kids');
    expect(mocks.getKids).toHaveBeenCalledWith('user_test');
    const payload = textPayload(result);
    expect(payload).toEqual([
      expect.objectContaining({ slug: 'rafi', name: 'Rafi', balance: 12 }),
    ]);
  });
});

describe('add_money', () => {
  it('looks up kid by slug then credits via createTransaction', async () => {
    mocks.getKidBySlugLite.mockResolvedValue({ id: 'kid_uuid_1' });
    mocks.createTransaction.mockResolvedValue({ transaction: { id: 't1' }, newBalance: 17 });

    const result = await callTool('add_money', { kidSlug: 'rafi', amount: 5, note: 'chores' });
    expect(mocks.getKidBySlugLite).toHaveBeenCalledWith('rafi', 'user_test');
    expect(mocks.createTransaction).toHaveBeenCalledWith(
      'kid_uuid_1', 5, 'credit', 'chores', 'user_test', 'checking',
    );
    expect(textPayload(result)).toMatchObject({ added: 5, newBalance: 17 });
  });

  it('errors gracefully on unknown slug', async () => {
    mocks.getKidBySlugLite.mockResolvedValue(null);
    const result = await callTool('add_money', { kidSlug: 'ghost', amount: 5, note: 'x' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).isError).toBe(true);
  });
});

describe('subtract_money', () => {
  it('routes to createTransaction with type=debit', async () => {
    mocks.getKidBySlugLite.mockResolvedValue({ id: 'kid_uuid_1' });
    mocks.createTransaction.mockResolvedValue({ transaction: { id: 't1' }, newBalance: 3 });

    await callTool('subtract_money', { kidSlug: 'rafi', amount: 2, note: 'snack' });
    expect(mocks.createTransaction).toHaveBeenCalledWith(
      'kid_uuid_1', 2, 'debit', 'snack', 'user_test', 'checking',
    );
  });
});

describe('transfer_between_accounts', () => {
  it('forwards to transferBetweenAccounts with the resolved kid id', async () => {
    mocks.getKidBySlugLite.mockResolvedValue({ id: 'kid_uuid_1' });
    mocks.transferBetweenAccounts.mockResolvedValue({
      checkingBalance: 5, savingsBalance: 10, charityBalance: 0, totalBalance: 15,
    });

    const result = await callTool('transfer_between_accounts', {
      kidSlug: 'rafi', amount: 10, from: 'checking', to: 'savings',
    });
    expect(mocks.transferBetweenAccounts).toHaveBeenCalledWith(
      'kid_uuid_1', 10, 'checking', 'savings', 'user_test',
    );
    expect(textPayload(result)).toMatchObject({ moved: 10, savingsBalance: 10 });
  });
});

describe('list_pending_chores', () => {
  it('returns just the fields useful to an LLM', async () => {
    mocks.getPendingCompletions.mockResolvedValue([
      {
        id: 'c1', choreId: 'ch1', kidId: 'k1',
        choreName: 'Make bed', choreValue: 1, completedAt: '2026-05-04T00:00:00Z',
        status: 'pending', transactionId: null, reviewedAt: null,
      },
    ]);
    const result = await callTool('list_pending_chores');
    expect(textPayload(result)).toEqual([
      { completionId: 'c1', choreId: 'ch1', kidId: 'k1', choreName: 'Make bed', choreValue: 1, completedAt: '2026-05-04T00:00:00Z' },
    ]);
  });
});

describe('approve_chore / reject_chore', () => {
  it('approve_chore calls reviewChoreCompletion(true)', async () => {
    mocks.reviewChoreCompletion.mockResolvedValue({
      id: 'c1', status: 'approved', transactionId: 't1', choreName: 'Make bed', choreValue: 1,
    });
    await callTool('approve_chore', { completionId: 'c1' });
    expect(mocks.reviewChoreCompletion).toHaveBeenCalledWith('c1', 'user_test', true);
  });

  it('reject_chore calls reviewChoreCompletion(false)', async () => {
    mocks.reviewChoreCompletion.mockResolvedValue({
      id: 'c1', status: 'rejected', choreName: 'Make bed',
    });
    await callTool('reject_chore', { completionId: 'c1' });
    expect(mocks.reviewChoreCompletion).toHaveBeenCalledWith('c1', 'user_test', false);
  });
});

describe('add_wishlist_item / remove_wishlist_item', () => {
  it('add_wishlist_item appends + stamps createdAt', async () => {
    mocks.getKidBySlug.mockResolvedValue({ savingsGoals: [{ id: 'g1', name: 'Bike', target: 100 }] });
    mocks.updateKid.mockResolvedValue({} as unknown as Kid);

    const result = await callTool('add_wishlist_item', {
      kidSlug: 'rafi', name: 'Switch', target: 300,
    });
    expect(mocks.updateKid).toHaveBeenCalledTimes(1);
    const payload = textPayload(result) as { added: { name: string; target: number; createdAt?: string }; wishlist: unknown[] };
    expect(payload.added.name).toBe('Switch');
    expect(payload.added.target).toBe(300);
    expect(payload.added.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.wishlist).toHaveLength(2);
  });

  it('remove_wishlist_item filters by id', async () => {
    mocks.getKidBySlug.mockResolvedValue({
      name: 'Rafi',
      savingsGoals: [{ id: 'g1', name: 'Bike', target: 100 }, { id: 'g2', name: 'Switch', target: 300 }],
    });
    mocks.updateKid.mockResolvedValue({} as unknown as Kid);

    const result = await callTool('remove_wishlist_item', { kidSlug: 'rafi', goalId: 'g1' });
    const updateArgs = mocks.updateKid.mock.calls[0]?.[2];
    expect((updateArgs as { savingsGoals: unknown[] }).savingsGoals).toEqual([
      { id: 'g2', name: 'Switch', target: 300 },
    ]);
    expect(textPayload(result)).toMatchObject({ removedId: 'g1' });
  });

  it('remove_wishlist_item errors if id not present', async () => {
    mocks.getKidBySlug.mockResolvedValue({
      name: 'Rafi',
      savingsGoals: [{ id: 'g1', name: 'Bike', target: 100 }],
    });
    const result = await callTool('remove_wishlist_item', { kidSlug: 'rafi', goalId: 'missing' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).isError).toBe(true);
  });
});

describe('get_settings', () => {
  it('returns the settings object verbatim', async () => {
    mocks.getSettings.mockResolvedValue({
      currency: 'USD',
      currencySymbol: '$',
      showWishlistAge: true,
    });
    const result = await callTool('get_settings');
    expect(textPayload(result)).toEqual({
      currency: 'USD',
      currencySymbol: '$',
      showWishlistAge: true,
    });
  });
});
