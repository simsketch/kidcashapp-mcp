import { getUserId } from '@/lib/auth';

/**
 * Resolve the authenticated user inside an MCP tool handler.
 *
 * `getUserId()` reads the `x-kidcash-user-id` header that `proxy.ts` sets
 * after validating the Bearer token, so MCP tools require zero per-tool auth
 * code — they just call this helper at the top.
 *
 * Throws an Error('Unauthorized') if no API key is attached. Tool handlers
 * should let this bubble; the MCP layer surfaces it to the LLM as an error
 * result so the model can ask the user to connect their account.
 */
export async function requireUserId(): Promise<string> {
  return getUserId();
}

/**
 * Wrap a tool handler with auth + uniform error formatting. The handler
 * receives the userId so it doesn't have to re-resolve it.
 */
export function withAuth<TArgs, TResult>(
  handler: (userId: string, args: TArgs) => Promise<TResult>,
) {
  return async (args: TArgs) => {
    try {
      const userId = await requireUserId();
      const result = await handler(userId, args);
      return formatResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  };
}

function formatResult<T>(value: T) {
  const text =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}
