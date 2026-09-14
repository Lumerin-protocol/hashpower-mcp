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
import { getHashprice, getMarginStatus, getOrderbook, getPositions } from "./tools/read.ts";
import { fail } from "./tools/result.ts";
import { buildDepositTx, buildOrderTx } from "./tools/scaffold.ts";
import { checkCanPlaceOrder, simulateOrder } from "./tools/simulate.ts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const INSTRUCTIONS = `You are connected to the Hashpower MCP server — a knowledge base and simulator, NOT a trading intermediary.

Hashpower is a permissionless marketplace for Bitcoin hashprice risk on Base. There is no trading API and no API keys. The contracts and subgraphs ARE the API.

Hard rules:
- Never ask this server to sign or broadcast a transaction. The agent (or its operator) holds the wallet.
- Production trading bots must import @hashpower/*-abi, encode calldata, and send from their own wallet.
- Scaffold tools (build_*_tx) are prototypes only. Always simulate_order and check_can_place_order first.
- Prerequisite: the wallet needs Base ETH for gas and USDC for collateral.
- Deposit to CollateralVault before trading. Collateral is unified across futures and perps.
- Read live hashprice via latestRoundData(); history/books/positions via subgraphs (they can lag).
- Start with get_deployments and get_market_rules, then get_units_and_scaling / get_margin_model.`;

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
    version: "0.1.0",
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
    "get_hashprice",
    {
      title: "Get hashprice",
      description: "Read the on-chain hashprice oracle via AggregatorV3 latestRoundData().",
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
        "On-chain CLOB prices. For futures, expirationAt (unix seconds) is required. Perps is a single perpetual book.",
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
    "get_positions",
    {
      title: "Get positions and open orders",
      description:
        "Open positions and resting orders for a wallet from the public subgraphs. Wallet is a parameter — this server has no session.",
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
