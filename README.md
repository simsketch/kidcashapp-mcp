# KidCash MCP

[![smithery badge](https://smithery.ai/badge/kidcashapp/kidcash-mcp)](https://smithery.ai/servers/kidcashapp/kidcash-mcp)

The official [Model Context Protocol](https://modelcontextprotocol.io) server for [KidCash](https://www.kidcashapp.com) — manage your kids' allowances, chores, wishlists, and balances from any AI assistant.

> Connect Claude, Cursor, Windsurf, or any MCP-compatible client and ask things like:
> - *"Add $5 to Rafi for cleaning his room"*
> - *"What are everyone's balances?"*
> - *"Approve every pending chore"*
> - *"Summarize Amiel's spending this month"*
> - *"Add a $300 Nintendo Switch to Rafi's wishlist"*

## Endpoint

```
https://www.kidcashapp.com/api/agent/mcp
```

Streamable HTTP transport. Authenticate with a Bearer token (`Authorization: Bearer <YOUR_API_KEY>`) — the same key that powers KidCash's Siri and Apple Watch integrations. Generate one at [kidcashapp.com/settings → API Keys](https://www.kidcashapp.com/settings).

For Smithery / gateways that only support query-string parameter injection, the same key works as `?apiKey=<YOUR_API_KEY>`.

## Setup

### Cursor / Windsurf

Add to `~/.cursor/mcp.json` (Cursor) or `~/.codeium/windsurf/mcp_config.json` (Windsurf):

```json
{
  "mcpServers": {
    "kidcash": {
      "url": "https://www.kidcashapp.com/api/agent/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_KIDCASH_API_KEY"
      }
    }
  }
}
```

### Claude Desktop

Claude Desktop runs MCP servers over stdio, so use [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) to bridge:

```json
{
  "mcpServers": {
    "kidcash": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://www.kidcashapp.com/api/agent/mcp",
        "--header",
        "Authorization: Bearer YOUR_KIDCASH_API_KEY"
      ]
    }
  }
}
```

### Claude.ai (web)

On Pro/Team plans, add as a custom connector:
- Settings → Connectors → Add custom connector
- URL: `https://www.kidcashapp.com/api/agent/mcp`
- Auth: Bearer token (paste your KidCash API key)

### Smithery

Listed at [smithery.ai/server/kidcashapp/kidcash-mcp](https://smithery.ai/server/kidcashapp/kidcash-mcp). Add it through Smithery's gateway and provide your KidCash API key when prompted.

## Tools

### Read (12 tools, 5 read-only)

| Tool | Description |
|---|---|
| `kids.list` | All kids on the account with balances |
| `kids.get` | One kid in detail (transactions, wishlist, chores) |
| `settings.get` | Currency, theme, feature toggles |
| `chores.pending` | Chore completions awaiting parent approval |
| `transactions.list` | Per-kid transaction history with optional date filter |

### Write (7 tools, all reversible from the dashboard)

| Tool | Description |
|---|---|
| `transactions.add` | Credit a kid's balance (chores, allowance, gifts) |
| `transactions.subtract` | Debit a kid's balance (purchases, fines) |
| `transactions.transfer` | Move between checking, savings, charity for one kid |
| `chores.approve` | Approve a pending chore (auto-credits if value > 0) |
| `chores.reject` | Reject a pending chore |
| `wishlist.add` | Add a savings goal to a kid's wishlist |
| `wishlist.remove` | Remove a savings goal |

Each write tool is annotated `readOnlyHint: false` per the MCP spec; `chores.reject` and `wishlist.remove` additionally carry `destructiveHint: true` so MCP clients surface a confirmation before invoking. All money tools cap individual transactions at $10,000 in their descriptions to guard against LLM amount mishearings.

## Source

This repo mirrors the production source under `src/lib/mcp/` and `src/app/api/agent/[transport]/route.ts`. The tool handlers are thin wrappers around the existing KidCash repo functions — they import from `@/lib/db/*` (not included here, as those modules are part of the closed-source app).

Read the source as a reference for:
- How to structure a multi-tool MCP server with [`mcp-handler`](https://github.com/vercel/mcp-handler)
- How to wrap an existing API behind MCP without duplicating logic
- How to use `withAuth()` to share auth across tools

## Security

- **Auth is per-account** via your existing API key. The model only ever sees your kids' data.
- **All write tools are reversible** from the KidCash dashboard.
- **Tool descriptions cap individual transactions** at $10,000 to defend against amount mis-recognition.
- **Rate limited** to 120 requests/min per IP at the gateway.
- The same API key is used by KidCash's Siri intents and Apple Watch app — revoking it instantly kills MCP access along with those.

## License

[MIT](./LICENSE) — the wrapper code in this repo is open source. KidCash itself remains a private app.

---

Built by [@simsketch](https://github.com/simsketch). Issues, suggestions, or feature requests welcome — open one at [github.com/simsketch/kidcashapp-mcp/issues](https://github.com/simsketch/kidcashapp-mcp/issues).
