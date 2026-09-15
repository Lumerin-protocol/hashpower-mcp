import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "./config.ts";
import type { ChainClient } from "./chain.ts";
import type { DeploymentsManifest } from "./deployments.ts";
import {
  getDeploymentsTool,
  getMarginModelTool,
  getMarketRulesTool,
  getUnitsAndScalingTool,
} from "./tools/knowledge.ts";
import {
  getExpirations,
  getFunding,
  getMarketSnapshot,
  getMarketStats,
  getOracleHistory,
  getTrades,
} from "./tools/market.ts";
import { getHashprice, getMarginStatus, getOrderbook, getPositions } from "./tools/read.ts";
import { fail } from "./tools/result.ts";
import { buildDepositTx, buildOrderTx } from "./tools/scaffold.ts";
import { checkCanPlaceOrder, simulateOrder } from "./tools/simulate.ts";
import { MCP_VERSION } from "./version.ts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const INSTRUCTIONS = `You are connected to the Hashpower MCP server — a knowledge base, live market scanner, and simulator. It is NOT a trading API and never holds keys.

Hashpower is a permissionless marketplace for Bitcoin hashprice risk on Base. The contracts and subgraphs ARE the API.

How to work:
1. Scan the market the way a human scans the trading UI. Start with get_market_snapshot, or compose get_hashprice, get_orderbook (price + size + orderCount), get_trades, get_funding, get_expirations, get_market_stats, and get_oracle_history.
2. Read the operator's goals together with get_market_rules / get_margin_model / get_units_and_scaling.
3. Form a strategy. Validate with simulate_order and check_can_place_order (and get_margin_status / get_positions when a wallet is in play).
4. Execute separately: import @hashpower/*-abi, encode calldata, sign and broadcast from the operator's wallet. Never ask this server to send a transaction.

Hard rules:
- Wallet addresses are tool parameters. This server has no session and no stickiness.
- Prerequisite: Base ETH for gas and USDC for collateral. Deposit to CollateralVault before trading. Collateral is unified across futures and perps.
- Subgraphs can lag; every market read reports chainHead vs subgraphHead.
- Scaffold tools (build_*_tx) are prototypes only. Production bots encode via the npm packages.
- Start with get_deployments if you need addresses, subgraph URLs, or ABI package versions.`;

async function run(fn: () => Promise<ToolResult> | ToolResult): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return fail(err);
  }
}

export function createServer(
  config: AppConfig,
  deployments: DeploymentsManifest,
  client: ChainClient,
): McpServer {
  const server = new McpServer({
    name: "hashpower",
    version: MCP_VERSION,
    description: INSTRUCTIONS,
  });

  server.registerTool(
    "get_deployments",
    {
      title: "Get deployments",
      description:
        "Return contract addresses, subgraph URLs, chain ID, and published @hashpower/*-abi package versions for the configured environment (testnet or mainnet).",
    },
    async () => run(() => getDeploymentsTool(config, deployments)()),
  );

  server.registerTool(
    "get_market_rules",
    {
      title: "Get market rules",
      description:
        "Agent-facing market semantics from hashpower.io /semantics (same source as GitBook). Omit slug to list the catalog; pass a slug such as futures-margin or perps-trading to fetch the markdown.",
      inputSchema: {
        slug: z
          .string()
          .optional()
          .describe("Semantics slug, e.g. collateral-and-accounts, futures-trading, oracle-reading"),
      },
    },
    async ({ slug }) => run(() => getMarketRulesTool(config, slug)),
  );

  server.registerTool(
    "get_margin_model",
    {
      title: "Get margin model",
      description: "Portfolio margin / IM / MM / liquidation rules for perps and futures.",
    },
    async () => run(() => getMarginModelTool(config)),
  );

  server.registerTool(
    "get_units_and_scaling",
    {
      title: "Get units and scaling",
      description: "Oracle decimals, futures contract unit/ticks, and perps QUANTITY_DECIMALS / order scaling.",
    },
    async () => run(() => getUnitsAndScalingTool(config)),
  );

  server.registerTool(
    "get_market_snapshot",
    {
      title: "Scan the market (UI equivalent)",
      description:
        "One-shot scan of the surfaces a human reads on the trading UI: live hashprice, perps book+tape+funding, futures expiries+nearest book+tape, venue stats, and 24h hashprice candles. Use this to form a strategy; execute trades separately via the ABI packages.",
      inputSchema: {
        maxLevels: z.number().int().min(1).max(50).default(10).describe("Book depth per side"),
        trades: z.number().int().min(1).max(100).default(20).describe("Recent tape prints per venue"),
        expirationAt: z
          .string()
          .optional()
          .describe("Futures expiry unix seconds to include; defaults to the nearest tradable expiry"),
      },
    },
    async ({ maxLevels, trades, expirationAt }) =>
      run(() => getMarketSnapshot(client, deployments, { maxLevels, trades, expirationAt })),
  );

  server.registerTool(
    "get_hashprice",
    {
      title: "Get hashprice",
      description:
        "On-chain hashprice via AggregatorV3 latestRoundData(), plus a scaled decimal string. USD also includes the latest oracles-subgraph tick the UI chart uses.",
      inputSchema: {
        pair: z.enum(["usd", "btc"]).default("usd").describe("HashpriceUSD (trading) or HashpriceBTC"),
      },
    },
    async ({ pair }) => run(() => getHashprice(client, deployments, pair)),
  );

  server.registerTool(
    "get_orderbook",
    {
      title: "Get order book",
      description:
        "Full CLOB depth: on-chain prices + getQuantityAtPrice sizes, merged with subgraph PriceLevel orderCount (same entities as the UI book). Bids are best-first (highest); asks are best-first (lowest). Futures requires expirationAt.",
      inputSchema: {
        venue: z.enum(["futures", "perps"]),
        maxLevels: z.number().int().min(1).max(50).default(10),
        expirationAt: z.string().optional().describe("Futures expiration unix seconds, integer string"),
      },
    },
    async ({ venue, maxLevels, expirationAt }) =>
      run(() => getOrderbook(client, deployments, venue, maxLevels, expirationAt)),
  );

  server.registerTool(
    "get_trades",
    {
      title: "Get recent trades",
      description:
        "Public tape from the Trade subgraph entity the UI Recent Trades tab uses. Optional wallet filters to that account. Signed quantity: positive = buy, negative = sell.",
      inputSchema: {
        venue: z.enum(["futures", "perps"]),
        first: z.number().int().min(1).max(100).default(25),
        wallet: z.string().optional().describe("Optional 0x-prefixed EOA to filter fills"),
      },
    },
    async ({ venue, first, wallet }) => run(() => getTrades(deployments, venue, first, wallet)),
  );

  server.registerTool(
    "get_funding",
    {
      title: "Get perps funding",
      description:
        "Perps funding singleton + recent FundingUpdate events (UI funding strip). Optional wallet adds on-chain getPendingFunding and subgraph settlements.",
      inputSchema: {
        first: z.number().int().min(1).max(50).default(10).describe("FundingUpdate rows, newest first"),
        wallet: z.string().optional().describe("Optional 0x-prefixed EOA"),
      },
    },
    async ({ first, wallet }) => run(() => getFunding(client, deployments, first, wallet)),
  );

  server.registerTool(
    "get_expirations",
    {
      title: "Get futures expirations",
      description:
        "On-chain getExpirationDates (the UI market selector) with tradable vs expired split, plus subgraph settlement prices.",
    },
    async () => run(() => getExpirations(client, deployments)),
  );

  server.registerTool(
    "get_market_stats",
    {
      title: "Get market stats",
      description:
        "Venue singleton (fees, ticks, volume, open orders) plus on-chain getMarketPrice. Same stats strip the UI reads from perps(id:0) / futures(id:0).",
      inputSchema: {
        venue: z.enum(["futures", "perps", "both"]).default("both"),
      },
    },
    async ({ venue }) => run(() => getMarketStats(client, deployments, venue)),
  );

  server.registerTool(
    "get_oracle_history",
    {
      title: "Get oracle history",
      description:
        "Oracle subgraph history the UI charts: hashprice USD/BTC, BTC/USD, network hashrate. interval=tick for raw samples; hour/day for Goldsky candles (current bucket included).",
      inputSchema: {
        series: z
          .enum(["hashpriceUsd", "hashpriceBtc", "btcUsd", "networkHashrate1d", "networkHashrate7d"])
          .default("hashpriceUsd"),
        interval: z.enum(["tick", "hour", "day"]).default("hour"),
        first: z.number().int().min(1).max(200).default(48),
      },
    },
    async ({ series, interval, first }) => run(() => getOracleHistory(deployments, series, interval, first)),
  );

  server.registerTool(
    "get_positions",
    {
      title: "Get positions and open orders",
      description:
        "Open positions and resting orders for a wallet from the public subgraphs (same PositionSession/Order entities as the UI). Wallet is a parameter — this server has no session.",
      inputSchema: {
        wallet: z.string().describe("0x-prefixed EOA"),
        venue: z.enum(["futures", "perps", "both"]).default("both"),
      },
    },
    async ({ wallet, venue }) => run(() => getPositions(deployments, wallet, venue)),
  );

  server.registerTool(
    "get_margin_status",
    {
      title: "Get margin status",
      description: "Vault balance, portfolio IM/MM, and isHealthy for a wallet (eth_call).",
      inputSchema: {
        wallet: z.string().describe("0x-prefixed EOA"),
      },
    },
    async ({ wallet }) => run(() => getMarginStatus(client, deployments, wallet)),
  );

  server.registerTool(
    "check_can_place_order",
    {
      title: "Check canPlaceOrder",
      description:
        "PortfolioMarginEngine.canPlaceOrder(wallet, additionalIM) — the pre-trade gate. additionalIM is integer token units (USDC 6 decimals).",
      inputSchema: {
        wallet: z.string(),
        additionalIm: z.string().describe("Additional IM in token native units, integer string"),
      },
    },
    async ({ wallet, additionalIm }) => run(() => checkCanPlaceOrder(client, deployments, wallet, additionalIm)),
  );

  server.registerTool(
    "simulate_order",
    {
      title: "Simulate order",
      description:
        "On-chain simulateOrder view: would this price/qty fill, at what average? Positive qty = buy, negative = sell. Does not place an order.",
      inputSchema: {
        venue: z.enum(["futures", "perps"]),
        price: z.string().describe("Limit price in token native units, integer string"),
        quantity: z.string().describe("Signed quantity integer string"),
        expirationAt: z.string().optional().describe("Required for futures"),
      },
    },
    async ({ venue, price, quantity, expirationAt }) =>
      run(() => simulateOrder(client, deployments, { venue, price, quantity, expirationAt })),
  );

  server.registerTool(
    "build_deposit_tx",
    {
      title: "Scaffold deposit calldata",
      description:
        "PROTOTYPE ONLY. Returns unsigned approve+deposit calldata. Simulate, then sign locally. Not for production bots.",
      inputSchema: {
        amount: z.string().describe("USDC native units, integer string (6 decimals)"),
      },
    },
    async ({ amount }) => run(() => buildDepositTx(deployments, amount)),
  );

  server.registerTool(
    "build_order_tx",
    {
      title: "Scaffold createOrder calldata",
      description:
        "PROTOTYPE ONLY. Returns unsigned createOrder calldata. Run simulate_order and check_can_place_order first. Production bots encode via the npm ABI packages.",
      inputSchema: {
        venue: z.enum(["futures", "perps"]),
        price: z.string(),
        quantity: z.string().describe("Signed quantity; positive = buy, negative = sell"),
        timeInForce: z.enum(["GTC", "IOC", "FOK"]).default("GTC"),
        expirationAt: z.string().optional().describe("Required for futures"),
      },
    },
    async ({ venue, price, quantity, timeInForce, expirationAt }) =>
      run(() => buildOrderTx(deployments, { venue, price, quantity, timeInForce, expirationAt })),
  );

  return server;
}
