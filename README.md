# @hashpower/mcp

Knowledge base and simulator for agents building Hashpower trading bots. **Not a trading API.** This server never holds keys, never broadcasts transactions, and is never in the production trade path.

The permissionless API is the contracts on Base plus the public subgraphs. This MCP server teaches an agent those rules, lets it scan the same live market a human reads on the trading UI, and lets it simulate - then the agent writes its own bot against [`@hashpower/*-abi`](https://www.npmjs.com/org/hashpower). Execution never goes through this server.

**Instruction manual** (setup, guardrails, tools, units, how to execute locally): [`docs/agent-manual.md`](./docs/agent-manual.md). Hosted for agents at [dev.hashpower.io/build/mcp.md](https://dev.hashpower.io/build/mcp.md) (testnet) and [hashpower.io/build/mcp.md](https://hashpower.io/build/mcp.md) (mainnet; site build rewrites client key and URLs).

## Connect

**Hosted testnet** - Cursor key `dev-hashpower` (reserves `hashpower` for production):

```json
{
  "mcpServers": {
    "dev-hashpower": {
      "url": "https://mcp.dev.hashpower.io/mcp"
    }
  }
}
```

**Hosted mainnet** (when LMN is live):

```json
{
  "mcpServers": {
    "hashpower": {
      "url": "https://mcp.hashpower.io/mcp"
    }
  }
}
```

Same image, `HASHPOWER_ENV` flipped by the deploy workflow. `initialize.serverInfo.name` is `dev-hashpower` on testnet and `hashpower` on mainnet.

**Local stdio** (agent brings its own RPC):

```json
{
  "mcpServers": {
    "dev-hashpower": {
      "command": "npx",
      "args": ["-y", "@hashpower/mcp"],
      "env": {
        "HASHPOWER_ENV": "testnet"
      }
    }
  }
}
```

Until the first npm publish, `npx -y github:Lumerin-protocol/hashpower-mcp#dev` works the same way.

Optional env:

| Variable | Default (testnet) | Meaning |
| --- | --- | --- |
| `HASHPOWER_ENV` | `testnet` | `testnet` (Base Sepolia) or `mainnet` |
| `HASHPOWER_RPC_URL` | `https://sepolia.base.org` | Ethereum JSON-RPC |
| `HASHPOWER_DOCS_URL` | `https://dev.hashpower.io` | Semantics source (`/semantics/*`) |
| `HASHPOWER_TRANSPORT` | `stdio` | `stdio` or `http` |
| `PORT` | `8080` | HTTP bind port |

Prerequisite for any real trade: the bot wallet holds Base ETH (gas) and USDC (collateral). Deposit to `CollateralVault` first.

## Tools

See the [instruction manual](./docs/agent-manual.md) for the full catalog, units, and operating loop. Short list:

**Knowledge:** `get_deployments`, `get_market_rules`, `get_margin_model`, `get_units_and_scaling`

**Read:** `get_market_snapshot`, `get_hashprice`, `get_orderbook`, `get_trades`, `get_funding`, `get_expirations`, `get_market_stats`, `get_oracle_history`, `get_positions`, `get_margin_status`

**Simulate:** `simulate_order`, `check_can_place_order`

**Scaffold (prototype only):** `build_deposit_tx`, `build_order_tx` - unsigned calldata. Production bots encode via the npm packages.

## Local dev

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm start
HASHPOWER_TRANSPORT=http pnpm start:http
```

Hosted HTTP is stateless: no MCP session, no ALB stickiness. Any Fargate task can serve any request.

## What this is not

- Not a wallet manager
- Not a hosted order router
- Not an API-key product
- Not in the runtime path of a production bot
