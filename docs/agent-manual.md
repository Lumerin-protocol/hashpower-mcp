# Hashpower MCP - agent instruction manual

How an agent harness (Cursor, Claude, a custom runtime, a cron bot) connects to Hashpower, scans the market, respects the guardrails, and trades. **This server is not a trading API.** The exchange is the contracts on Base plus the public subgraphs.

Published copies:

- This git file lists **both** venues. Copy-paste snippets below are testnet-first.
- Hosted copies are rewritten at **site build** for that environment: [dev.hashpower.io/build/mcp.md](https://dev.hashpower.io/build/mcp.md) (`dev-hashpower`) and [hashpower.io/build/mcp.md](https://hashpower.io/build/mcp.md) (`hashpower` / `https://mcp.hashpower.io/mcp`).
- HTML: [dev.hashpower.io/build/mcp/](https://dev.hashpower.io/build/mcp/) and [hashpower.io/build/mcp/](https://hashpower.io/build/mcp/).

---

## 1. What the MCP is for

Hashpower is a permissionless marketplace for Bitcoin hashprice risk: dated **futures** and a **perpetual** CLOB, priced by an on-chain hashprice oracle, collateralized in USDC, on Base.

Three layers an agent uses:

| Layer | Role | Holds keys? |
| --- | --- | --- |
| **MCP** (`dev-hashpower` / `hashpower`) | Teach rules, scan the same surfaces as the trading UI, simulate fills and margin | No |
| **`@hashpower/*-abi` npm packages** | Encode `deposit` / `withdraw` / `createOrder` / `cancelOrder` calldata | No |
| **Operator wallet** | Sign and broadcast. This is the only write path | Yes - on the operator's machine, never on ours |

The intended loop:

1. **Scan** - MCP reads (or the agent reads subgraphs / `eth_call` itself).
2. **Decide** - operator goals + market rules + live book/tape/oracle.
3. **Simulate** - `simulate_order` and `check_can_place_order` (on-chain views).
4. **Execute elsewhere** - a **local executor** you run, with the private key only in that process: fund the EOA, `approve`+`deposit` into `CollateralVault`, then `createOrder` / `cancelOrder` / flatten / `withdraw`.

A production bot does **not** have to stay on MCP at runtime. Once the strategy is written, it can talk to chain and subgraphs directly. MCP is the research terminal and the on-ramp for a new harness.

---

## 2. Guardrails (hard rules)

Copy these into the harness system prompt. They are also the MCP server's own instructions.

1. **Never send a private key to the MCP server.** It has no signing tools and must not gain any.
2. **Never ask the MCP to broadcast a transaction.** `build_*_tx` returns unsigned calldata only, and is a prototype - production code encodes via npm ABIs.
3. **Wallet addresses are tool parameters**, not login state. The hosted server is stateless (no MCP session, no sticky load balancer).
4. **Testnet vs mainnet are different venues.** Use the `dev-hashpower` client key against `https://mcp.dev.hashpower.io/mcp` (Base Sepolia). Reserve the `hashpower` key for `https://mcp.hashpower.io/mcp` (Base mainnet, when live). `initialize.serverInfo.name` matches that split.
5. **Fund the wallet before trading:** Base ETH for gas and USDC for collateral. Deposit USDC to `CollateralVault` first. One vault backs both futures and perps.
6. **Call `PortfolioMarginEngine.canPlaceOrder` before every order.** MCP exposes this as `check_can_place_order`. Additional IM is USDC native units (6 decimals), integer string.
7. **Subgraphs can lag the chain.** Every market read reports `chainHead` vs `subgraphHead` (`lagBlocks`). Treat chain as source of truth for the live CLOB; treat the subgraph as the UI's tape, books' `orderCount`, and history.
8. **Integer strings, no decimals, in tool arguments.** Prices, quantities, amounts, and `expirationAt` are decimal-integer strings (e.g. `"37680000"`), never `"37.68"`.
9. **Signed quantity:** positive = buy / long, negative = sell / short. Futures `createOrder` also needs `expirationAt` (unix seconds).
10. **Do not treat `build_*_tx` as a production order router.** If you execute, you (or your local bot) import `@hashpower/perps-abi`, `@hashpower/futures-abi`, `@hashpower/collateral-abi` and sign yourself.

There is no API key, no staking gate on the MCP, and no hosted order router. Anyone who can sign a Base transaction can trade, with or without our MCP.

---

## 3. Names and URLs

| | Testnet (now) | Mainnet (LMN) |
| --- | --- | --- |
| MCP client key | `dev-hashpower` | `hashpower` |
| Hosted URL | `https://mcp.dev.hashpower.io/mcp` | `https://mcp.hashpower.io/mcp` |
| Docs / `llms.txt` | `https://dev.hashpower.io` | `https://hashpower.io` |
| Chain | Base Sepolia (`84532`) | Base (`8453`) |
| `HASHPOWER_ENV` | `testnet` | `mainnet` |
| Health | `https://mcp.dev.hashpower.io/health` | `https://mcp.hashpower.io/health` |

npm package for local stdio: [`@hashpower/mcp`](https://www.npmjs.com/package/@hashpower/mcp). Same image; env flips the deployments it loads.

---

## 4. Set up any agent harness

### 4.1 Hosted Streamable HTTP (usual path)

The hosted server speaks **MCP Streamable HTTP**, JSON responses, **no session**. Point the client at the `/mcp` URL.

**Cursor** (`~/.cursor/mcp.json` or a project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "dev-hashpower": {
      "url": "https://mcp.dev.hashpower.io/mcp"
    }
  }
}
```

Reload MCP tools after connecting. You should see `get_market_snapshot`, `get_orderbook`, `simulate_order`, and the rest - not a 12-tool subset from an older image.

**Any other harness** that supports Streamable HTTP: same URL. Typical JSON-RPC:

```bash
curl -sS -X POST https://mcp.dev.hashpower.io/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"my-harness","version":"0.0.0"}}}'
```

Then `tools/list` and `tools/call` with `{ "name": "<tool>", "arguments": { ... } }`. No `Mcp-Session-Id` required.

Sanity check: `GET https://mcp.dev.hashpower.io/health` returns `"ok": true` and `"name": "dev-hashpower"` on testnet.

### 4.2 Local stdio (your RPC, still no keys in the server)

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

Optional env: `HASHPOWER_RPC_URL` (defaults to the public Base Sepolia RPC), `HASHPOWER_DOCS_URL` (defaults to `https://dev.hashpower.io`).

Stdio is for the **MCP process**. It still does not sign. Put keys only in a separate executor you run.

### 4.3 There is no "connect wallet" on MCP

Hashpower does not have accounts, API keys, or an MCP login. **The EOA that signs is the account.**

| What people call "connect" | What it actually is |
| --- | --- |
| Pointing Cursor at MCP | Research terminal only. No wallet, no session. |
| WalletConnect on the [trading UI](https://dev.hashpower.exchange) | Human blotter. Same address as the bot, so you can watch fills. Not required for trading. |
| Local executor with a private key | The write path. Load the key from env / KMS / hardware **on that host**. Sign `approve`, `deposit`, `createOrder`, `cancelOrder`, `withdraw`. |

Do not paste a private key into chat, MCP tool arguments, or hosted config. Give it only to the process you run.

### 4.4 Fund the EOA and deposit liquidity

A bot that "does everything" still cannot mint ETH or USDC. The operator funds the EOA first; the executor then moves USDC into the vault.

1. Put **Base ETH** (gas) and **USDC** (6 decimals) on the EOA for the target chain. There is no Hashpower faucet.
2. Resolve addresses once (`get_deployments` or `deployments.json`): `CollateralToken` (USDC), `CollateralVault`, `HashPowerPerpsDEX`, `HashPowerFutures` / `Futures`, `PortfolioMarginEngine`.
3. **Approve** the vault to spend USDC, then **deposit**:
   - `USDC.approve(CollateralVault, amount)` then `CollateralVault.deposit(amount)` (two txs), or
   - `CollateralVault.depositForPermit(...)` if the token supports EIP-2612 (one tx).
4. Amounts are USDC 6-decimal integer strings (`"1000000"` = $1). `deposit` credits a receipt balance that **both** futures and perps share. You do not deposit per venue.
5. Confirm with MCP `get_margin_status(wallet)` (`balance`, `initialMargin`, `maintenanceMargin`, `excessOverIM`, `isHealthy`) or `CollateralVault.balanceOf(wallet)` on chain.

Until step 3 lands, `check_can_place_order` will fail for a funded-but-not-deposited wallet (USDC in the EOA is not margin until it is in the vault).

Full semantics: [collateral-and-accounts](https://dev.hashpower.io/semantics/collateral-and-accounts.md) or MCP `get_market_rules` with slug `collateral-and-accounts`.

---

## 5. Operating loop

Give the model **goals** in the user prompt (risk, venue, size cap, "recommend only" vs "you may send from my local signer"). Then the agent should:

1. `get_deployments` once if it needs addresses / ABI package versions (optional if it will only scan).
2. `get_market_snapshot` - one-shot UI scan: hashprice, perps book+tape+funding, futures expiries+nearest book, stats, 24h candles.
3. Pull semantics as needed: `get_market_rules` (omit slug for the catalog), `get_units_and_scaling`, `get_margin_model`.
4. If a wallet is in play: `get_margin_status` and `get_positions`. If `balance` is `"0"` and the EOA holds USDC, the executor still needs the approve+deposit in section 4.4.
5. Form a concrete order: venue, price, signed quantity, TIF (`GTC` / `IOC` / `FOK`), `expirationAt` for futures.
6. `simulate_order` - would it fill, at what average, remainder? Does **not** place.
7. `check_can_place_order` with a conservative `additionalIm` in USDC 6-decimal integer units.
8. **Recommend** the calldata and intent to the operator, **or** (only in a local executor that already has a key) encode and send. Stop if the operator said not to trade.

Starter prompts:

- *Scan the Hashpower market like the trading UI and summarize hashprice, perps book, tape, funding, and the nearest futures expiry - do not trade.*
- *Using my goals (hedge 1 PH/s-day of hashprice for the front month, max 50 bps from mid, GTC), propose a futures order. Simulate it. Do not send.*
- *Wallet 0x... is the bot. Check margin and open orders. If the vault is empty, list the approve+deposit txs. Recommend whether we can add a small perps bid at best bid. Do not send.*
- *I run a local executor with the key in env (never send the key here). From wallet 0x..., deposit if needed, then trade perps and the front-month future within my limits, and flatten + withdraw free collateral if the book moves against the plan.*

---

## 6. Tool catalog

### Knowledge (docs, not chain)

| Tool | Use when |
| --- | --- |
| `get_deployments` | Addresses, subgraph URLs, chain ID, `@hashpower/*-abi` versions |
| `get_market_rules` | Optional `slug` (e.g. `perps-trading`, `futures-margin`). Omit to list the catalog from `/semantics` |
| `get_margin_model` | IM / MM / liquidation prose for both venues |
| `get_units_and_scaling` | Oracle decimals, ticks, `QUANTITY_DECIMALS` |

### Read (UI-equivalent market data)

| Tool | Use when |
| --- | --- |
| `get_market_snapshot` | First look at the market. Optional `maxLevels`, `trades`, `expirationAt` |
| `get_hashprice` | `pair`: `usd` (trading index) or `btc` |
| `get_orderbook` | Depth with **price + size + orderCount**. `venue` `perps` or `futures`; futures requires `expirationAt` |
| `get_trades` | Public tape. Optional `wallet` filter. Each match appears twice (one row per side) |
| `get_funding` | Perps funding strip. Optional wallet adds on-chain `getPendingFunding` |
| `get_expirations` | Futures market selector + settlement overlay |
| `get_market_stats` | Fees, ticks, volume, `getMarketPrice` |
| `get_oracle_history` | Chart data: `hashpriceUsd`, `hashpriceBtc`, `btcUsd`, `networkHashrate1d`, `networkHashrate7d`; `tick`, `hour`, or `day` |
| `get_positions` | Open orders + sessions for a `wallet`. Order `id` is the on-chain `bytes32` for `cancelOrder` |
| `get_margin_status` | Vault `balance`, portfolio IM/MM, `excessOverIM`, `isHealthy` |

### Simulate

| Tool | Use when |
| --- | --- |
| `simulate_order` | `venue`, `price`, signed `quantity`; `expirationAt` required for futures |
| `check_can_place_order` | `wallet`, `additionalIm` (USDC 6-dec integer string) |

### Scaffold (prototype only)

| Tool | Use when |
| --- | --- |
| `build_deposit_tx` | Learning the approve+deposit sequence. **Do not** treat as a production deposit API |
| `build_order_tx` | Learning `createOrder` encoding. Production bots encode via npm |

There is no `build_withdraw_tx` / `build_cancel_tx` on MCP. Encode those locally (section 8).

---

## 7. Units (so the agent does not invent decimals)

Always pass **integer strings** into tools. Scale for display yourself.

| Quantity | Scale | Example |
| --- | --- | --- |
| CLOB price (both venues) | USDC **6** decimals; `minimumPriceIncrement` is typically `10000` ($0.01) | `"37680000"` = $37.68 |
| Perps size | **6** decimals (`QUANTITY_DECIMALS`) | `"4024333"` = 4.024333 |
| Futures size | Whole contracts (`QUANTITY_DECIMALS` = 0) | `"16"` = 16 contracts |
| HashpriceUSD oracle | **8** decimals (`latestRoundData().answer`) | `"3766413350"` = $37.66413350 |
| HashpriceBTC oracle | **16** decimals | see `get_hashprice` `pair=btc` |
| Vault / `additionalIm` | USDC **6** decimals | `"1000000"` = $1 |
| Futures `expirationAt` | Unix **seconds** | from `get_expirations` |
| Oracle subgraph timestamps | Goldsky **microseconds** (tools also return `timestampUnix`) | n/a |
| Perps `fundingRate` | 1e18-scaled; UI percent is about `(rate / 1e18) * 100` | testnet may be `0` |

`get_orderbook` already returns `bestBid` / `bestAsk` / `spread` / `mid` / depths plus per-level `quantity` and `orderCount`.

---

## 8. Local execution bot (outside this server)

Split the work:

1. **Research** - hosted MCP (or your own RPC + subgraphs). No keys.
2. **Execute** - a process only you run. Private key in env, KMS, or hardware on **that** host.

That executor can cover the full life cycle: deposit liquidity, trade perps and futures, cancel, flatten when the market moves, withdraw free collateral. Hosted MCP never sees the key and never sends the txs.

Write-path (viem + the npm packages; testnet sketch):

```ts
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { HashPowerPerpsDEXAbi } from "@hashpower/perps-abi";
import { CollateralVaultAbi } from "@hashpower/collateral-abi";
import { ERC20Abi, HashPowerFuturesAbi } from "@hashpower/futures-abi";

// account = privateKeyToAccount(process.env.EXECUTOR_PRIVATE_KEY)  // local only
// addresses: @hashpower/*/deployments.json -> environments.testnet.contracts
// TIF: 0 = GTC, 1 = IOC, 2 = FOK

// Fund (operator, once): native ETH + USDC on the EOA
// USDC.approve(vault, amount)
// vault.deposit(amount)                  // or vault.depositForPermit(...)
// perps.createOrder(price, quantity, tif)
// futures.createOrder(price, expirationAt, quantity, tif)
// perps.cancelOrder(orderId) / futures.cancelOrder(orderId)   // bytes32 from get_positions
// flatten: createOrder with the opposite signed quantity (and expirationAt on futures)
// vault.withdraw(amount)                 // reverts if it would breach portfolio MM
```

Exit when markets change:

1. `get_positions(wallet)` - cancel each resting order (`cancelOrder` with that `id`).
2. For each open session, `simulate_order` an opposite signed quantity, then `createOrder` to flatten (IOC/FOK if you must not rest).
3. `get_margin_status` - `excessOverIM` is a hint; `withdraw` is still gated on chain. You cannot pull collateral that backs remaining exposure.
4. Optional: disconnect nothing. There is no session to close. Stop the executor.

Rules for that process:

- Private key stays in env / KMS / hardware on **that** host. Never in MCP tool arguments, never in chat logs you do not control.
- Re-run `simulateOrder` and `canPlaceOrder` immediately before send; the book moves.
- Start on **testnet**. Mainnet is a different deployment and a different MCP name.
- Same wallet in the UI is your live blotter.

Addresses and subgraph URLs: MCP `get_deployments`, or [dev.hashpower.io/deployments.json](https://dev.hashpower.io/deployments.json), or each package's `deployments.json`.

Market-rule prose (units, margin, settlement): [dev.hashpower.io/semantics/](https://dev.hashpower.io/semantics/index.json) or MCP `get_market_rules`.

---

## 9. What this is not

- Not a wallet manager, custody service, or keystore
- Not a hosted order router or matching engine
- Not an API-key product
- Not in the runtime path of a production bot (optional at research time only)
- Not a substitute for reading `/semantics` before sizing risk

If a harness cannot speak MCP, skip the server: read `llms.txt`, import the npm ABIs, query subgraphs, `eth_call` the same view functions the MCP wraps. The exchange does not require our MCP.
