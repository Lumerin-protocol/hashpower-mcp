# @hashpower/mcp

Knowledge base and simulator for agents building Hashpower trading bots. **Not a trading API.** This server never holds keys, never broadcasts transactions, and is never in the production trade path.

The permissionless API is the contracts on Base plus the public subgraphs. This MCP server teaches an agent those rules, lets it read live data, and lets it simulate — then the agent writes its own bot against [`@hashpower/*-abi`](https://www.npmjs.com/org/hashpower).

## Quick start (Cursor / Claude Desktop)

```json
{
  "mcpServers": {
    "hashpower": {
      "command": "npx",
      "args": ["-y", "@hashpower/mcp"],
      "env": {
        "HASHPOWER_ENV": "testnet"
      }
    }
  }
}
```

Optional env:

| Variable | Default (testnet) | Meaning |
| --- | --- | --- |
| `HASHPOWER_ENV` | `testnet` | `testnet` (Base Sepolia) or `mainnet` |
| `HASHPOWER_RPC_URL` | `https://sepolia.base.org` | Ethereum JSON-RPC |
| `HASHPOWER_DOCS_URL` | `https://dev.hashpower.io` | Semantics source (`/semantics/*`) |

Prerequisite for any real trade: the bot wallet holds Base ETH (gas) and USDC (collateral). Deposit to `CollateralVault` first.

## Tools

**Knowledge** — from [hashpower.io/build](https://dev.hashpower.io/build/) / `/semantics`, same prose as GitBook:

- `get_deployments`
- `get_market_rules` (optional `slug`)
- `get_margin_model`
- `get_units_and_scaling`

**Read** — `eth_call` + subgraphs, no keys:

- `get_hashprice`
- `get_orderbook`
- `get_positions` (`wallet` is a **parameter**, not session state)
- `get_margin_status`

**Simulate**

- `simulate_order`
- `check_can_place_order`

**Scaffold (prototype only)**

- `build_deposit_tx` / `build_order_tx` — unsigned calldata. Production bots encode via the npm packages themselves.

## Local dev

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm start
```

Hosted Streamable HTTP (`mcp.hashpower.io` on Fargate) is the next slice. This package is stdio-first so agents can run it beside themselves with zero Hashpower hosting.

## What this is not

- Not a wallet manager
- Not a hosted order router
- Not an API-key product
- Not in the runtime path of a production bot
