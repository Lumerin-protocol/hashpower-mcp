import { HashpriceBTCAbi, HashpriceUSDAbi } from "@hashpower/oracle-abi";
import { CollateralVaultAbi, PortfolioMarginEngineAbi } from "@hashpower/collateral-abi";
import { HashPowerFuturesAbi } from "@hashpower/futures-abi";
import { HashPowerPerpsDEXAbi } from "@hashpower/perps-abi";
import { chainHead } from "../chain.ts";
import type { ChainClient } from "../chain.ts";
import type { DeploymentsManifest } from "../deployments.ts";
import { requireContract, requireSubgraph } from "../deployments.ts";
import { graphql, META_BLOCK, walletId } from "../graphql.ts";
import { asAddress, scaleUnits } from "../json.ts";
import { freshness, mergeSubgraphLevels, summarizeBook, zipChainLevels } from "./book.ts";
import type { BookLevel, SubgraphLevel } from "./book.ts";
import { ok } from "./result.ts";

type Client = ChainClient;

interface PriceLevelRow {
  price: string;
  isBid: boolean;
  totalQuantity: string;
  orderCount: number;
}

interface OracleTick {
  price: string;
  timestamp: string;
  blockNumber: string;
}

export interface OrderbookData {
  venue: "futures" | "perps";
  address: `0x${string}`;
  expirationAt?: string;
  maxLevels: number;
  bids: BookLevel[];
  asks: BookLevel[];
  bestBid: string | null;
  bestAsk: string | null;
  spread: string | null;
  mid: string | null;
  bidDepth: string;
  askDepth: string;
  subgraphExtra: { bids: BookLevel[]; asks: BookLevel[] };
  chainHead: string;
  subgraphHead: number | null;
  lagBlocks: number | null;
  priceUnits: string;
  quantityUnits: string;
  note: string;
}

async function quantitiesAtPrices(params: {
  client: Client;
  address: `0x${string}`;
  venue: "futures" | "perps";
  prices: readonly bigint[];
  isBid: boolean;
  expirationAt?: bigint;
}): Promise<bigint[]> {
  const { client, address, venue, prices, isBid, expirationAt } = params;
  if (prices.length === 0) return [];
  if (venue === "perps") {
    const rows = await client.multicall({
      allowFailure: true,
      contracts: prices.map((price) => ({
        address,
        abi: HashPowerPerpsDEXAbi,
        functionName: "getQuantityAtPrice" as const,
        args: [price, isBid] as const,
      })),
    });
    return rows.map((row) => (row.status === "success" ? row.result : 0n));
  }
  if (expirationAt === undefined) {
    throw new Error("expirationAt is required for futures quantity reads");
  }
  const rows = await client.multicall({
    allowFailure: true,
    contracts: prices.map((price) => ({
      address,
      abi: HashPowerFuturesAbi,
      functionName: "getQuantityAtPrice" as const,
      args: [expirationAt, price, isBid] as const,
    })),
  });
  return rows.map((row) => (row.status === "success" ? row.result : 0n));
}

async function subgraphLevels(
  url: string,
  venue: "futures" | "perps",
  expirationAt?: string,
): Promise<{ levels: SubgraphLevel[]; subgraphHead: number | null }> {
  const where =
    venue === "futures"
      ? `expirationAt: "${expirationAt}", totalQuantity_gte: 1`
      : "orderCount_gte: 1";
  const extra = venue === "futures" ? "expirationAt" : "";
  const { data, meta } = await graphql<{ priceLevels: PriceLevelRow[] }>(
    url,
    `{ ${META_BLOCK}
      priceLevels(first: 200, where: { ${where} }, orderBy: price, orderDirection: desc) {
        price isBid totalQuantity orderCount ${extra}
      }
    }`,
  );
  return {
    subgraphHead: meta.blockNumber,
    levels: data.priceLevels.map((row) => ({
      price: row.price,
      isBid: row.isBid,
      totalQuantity: row.totalQuantity,
      orderCount: row.orderCount,
    })),
  };
}

export async function loadOrderbook(
  client: Client,
  deployments: DeploymentsManifest,
  venue: "futures" | "perps",
  maxLevels: number,
  expirationAt?: string,
): Promise<OrderbookData> {
  const contracts = deployments.environment.contracts;
  const head = await chainHead(client);

  if (venue === "futures" && !expirationAt) {
    throw new Error("expirationAt (unix seconds, integer string) is required for futures order books");
  }

  const address =
    venue === "perps"
      ? requireContract(contracts, "HashPowerPerpsDEX")
      : requireContract(contracts, "HashPowerFutures", "Futures");
  const expiry = expirationAt === undefined ? undefined : BigInt(expirationAt);

  const [bidPrices, askPrices] =
    venue === "perps"
      ? await client.readContract({
          address,
          abi: HashPowerPerpsDEXAbi,
          functionName: "getOrderBookPrices",
          args: [BigInt(maxLevels)],
        })
      : await client.readContract({
          address,
          abi: HashPowerFuturesAbi,
          functionName: "getOrderBookPrices",
          args: [expiry as bigint, BigInt(maxLevels)],
        });

  const [bidQty, askQty] = await Promise.all([
    quantitiesAtPrices({ client, address, venue, prices: bidPrices, isBid: true, expirationAt: expiry }),
    quantitiesAtPrices({ client, address, venue, prices: askPrices, isBid: false, expirationAt: expiry }),
  ]);

  let bids = zipChainLevels(bidPrices, bidQty);
  let asks = zipChainLevels(askPrices, askQty);
  let extraBids: BookLevel[] = [];
  let extraAsks: BookLevel[] = [];
  let subgraphHead: number | null = null;

  try {
    const subgraphName = venue === "perps" ? "perps" : "futures";
    const url = requireSubgraph(deployments.environment.subgraphs, subgraphName);
    const subgraph = await subgraphLevels(url, venue, expirationAt);
    subgraphHead = subgraph.subgraphHead;
    const mergedBids = mergeSubgraphLevels(bids, subgraph.levels, true);
    const mergedAsks = mergeSubgraphLevels(asks, subgraph.levels, false);
    bids = mergedBids.levels;
    asks = mergedAsks.levels;
    extraBids = mergedBids.extra;
    extraAsks = mergedAsks.extra;
  } catch {
    // Chain book is the source of truth; subgraph orderCount is additive.
  }

  const summary = summarizeBook(bids, asks);
  return {
    venue,
    address,
    ...(expirationAt ? { expirationAt } : {}),
    maxLevels,
    bids,
    asks,
    ...summary,
    subgraphExtra: { bids: extraBids, asks: extraAsks },
    ...freshness(head, subgraphHead),
    priceUnits: "contract price ticks (USDC 6-decimal integers; minimumPriceIncrement applies)",
    quantityUnits:
      venue === "perps"
        ? "absolute remaining size at the level; QUANTITY_DECIMALS = 6"
        : "whole contracts remaining at the level; QUANTITY_DECIMALS = 0",
    note: "Chain getOrderBookPrices + getQuantityAtPrice (same CLOB simulateOrder walks). orderCount/subgraphQuantity come from the PriceLevel subgraph entity the trading UI uses and can lag chainHead.",
  };
}

export async function getOrderbook(
  client: Client,
  deployments: DeploymentsManifest,
  venue: "futures" | "perps",
  maxLevels: number,
  expirationAt?: string,
) {
  return ok(await loadOrderbook(client, deployments, venue, maxLevels, expirationAt));
}

export async function loadHashprice(client: Client, deployments: DeploymentsManifest, pair: "usd" | "btc") {
  const contracts = deployments.environment.contracts;
  const address =
    pair === "usd"
      ? requireContract(contracts, "HashpriceUSD")
      : requireContract(contracts, "HashpriceBTC");
  const abi = pair === "usd" ? HashpriceUSDAbi : HashpriceBTCAbi;
  const [round, decimals, head] = await Promise.all([
    client.readContract({ address, abi, functionName: "latestRoundData" }),
    client.readContract({ address, abi, functionName: "decimals" }),
    chainHead(client),
  ]);
  const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
  const decimalCount = Number(decimals);

  let subgraph: Record<string, unknown> | undefined;
  if (pair === "usd") {
    try {
      const url = requireSubgraph(deployments.environment.subgraphs, "oracles");
      const { data, meta } = await graphql<{ hashpriceUsds: OracleTick[] }>(
        url,
        `{ ${META_BLOCK}
          hashpriceUsds(first: 1, orderBy: timestamp, orderDirection: desc) {
            price timestamp blockNumber
          }
        }`,
      );
      const tick = data.hashpriceUsds[0];
      subgraph = {
        subgraphHead: meta.blockNumber,
        latestTick: tick ?? null,
        note: "hashpriceUsds timeseries timestamp is microseconds; this is the chart series the UI plots.",
      };
    } catch (err) {
      subgraph = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    pair: pair === "usd" ? "HashpriceUSD" : "HashpriceBTC",
    address,
    decimals: decimalCount,
    roundId: roundId.toString(),
    answer: answer.toString(),
    scaled: scaleUnits(answer, decimalCount),
    startedAt: startedAt.toString(),
    updatedAt: updatedAt.toString(),
    answeredInRound: answeredInRound.toString(),
    chainHead: head.toString(),
    subgraph,
    note: "On-chain AggregatorV3 latestRoundData() is the trading index. Encode your own bot against @hashpower/oracle-abi — do not route trades through this server.",
  };
}

export async function getHashprice(client: Client, deployments: DeploymentsManifest, pair: "usd" | "btc") {
  return ok(await loadHashprice(client, deployments, pair));
}

interface OrderRow {
  id: string;
  price: string;
  quantity: string;
  originalQuantity: string;
  filledQuantity: string;
  isBuy: boolean;
  status: string;
  createdAt: string;
  expirationAt?: string;
}

interface PositionRow {
  id: string;
  netQuantity: string;
  entryPrice: string;
  realizedPnl: string;
  status: string;
  fundingFees?: string;
  tradingFees: string;
  maxQuantity: string;
  liquidatedQuantity: string;
  openedAt: string;
  lastTradeAt: string;
  expirationAt?: string;
}

export async function getPositions(deployments: DeploymentsManifest, wallet: string, venue: "futures" | "perps" | "both") {
  const address = asAddress("wallet", wallet);
  const id = walletId(address);
  const venues = venue === "both" ? (["futures", "perps"] as const) : ([venue] as const);
  const results: Record<string, unknown> = { wallet: address };

  for (const v of venues) {
    const url = requireSubgraph(deployments.environment.subgraphs, v);
    if (v === "futures") {
      const { data, meta } = await graphql<{
        orders: OrderRow[];
        positionSessions: PositionRow[];
      }>(
        url,
        `{ ${META_BLOCK}
          orders(first: 50, orderBy: createdAt, orderDirection: desc, where: { user: "${id}", status_in: [ACTIVE, PARTIALLY_FILLED] }) {
            id price quantity originalQuantity filledQuantity isBuy status createdAt expirationAt
          }
          positionSessions(first: 20, orderBy: lastTradeAt, orderDirection: desc, where: { user: "${id}", status: OPEN }) {
            id netQuantity entryPrice realizedPnl status tradingFees maxQuantity liquidatedQuantity openedAt lastTradeAt expirationAt
          }
        }`,
      );
      results.futures = {
        subgraphHead: meta.blockNumber,
        openOrders: data.orders,
        openPositions: data.positionSessions,
      };
    } else {
      const { data, meta } = await graphql<{
        orders: OrderRow[];
        positionSessions: PositionRow[];
      }>(
        url,
        `{ ${META_BLOCK}
          orders(first: 50, orderBy: createdAt, orderDirection: desc, where: { user: "${id}", status_in: [ACTIVE, PARTIALLY_FILLED] }) {
            id price quantity originalQuantity filledQuantity isBuy status createdAt
          }
          positionSessions(first: 20, orderBy: lastTradeAt, orderDirection: desc, where: { user: "${id}", status: OPEN }) {
            id netQuantity entryPrice realizedPnl status fundingFees tradingFees maxQuantity liquidatedQuantity openedAt lastTradeAt
          }
        }`,
      );
      results.perps = {
        subgraphHead: meta.blockNumber,
        openOrders: data.orders,
        openPositions: data.positionSessions,
      };
    }
  }

  results.note =
    "Same PositionSession / Order entities the trading UI renders. Subgraph data can lag the chain head. Wallet is a parameter — this server has no session. Connect the UI with this wallet for a live dashboard. This server is not in the trade path.";
  return ok(results);
}

export async function getMarginStatus(
  client: Client,
  deployments: DeploymentsManifest,
  wallet: string,
) {
  const address = asAddress("wallet", wallet);
  const contracts = deployments.environment.contracts;
  const vault = requireContract(contracts, "CollateralVault");
  const engine = requireContract(contracts, "PortfolioMarginEngine");
  const head = await chainHead(client);
  const [balance, im, mm, healthy] = await Promise.all([
    client.readContract({
      address: vault,
      abi: CollateralVaultAbi,
      functionName: "balanceOf",
      args: [address],
    }),
    client.readContract({
      address: engine,
      abi: PortfolioMarginEngineAbi,
      functionName: "computePortfolioIM",
      args: [address],
    }),
    client.readContract({
      address: engine,
      abi: PortfolioMarginEngineAbi,
      functionName: "computePortfolioMM",
      args: [address],
    }),
    client.readContract({
      address: engine,
      abi: PortfolioMarginEngineAbi,
      functionName: "isHealthy",
      args: [address],
    }),
  ]);
  return ok({
    wallet: address,
    vault,
    engine,
    balance: balance.toString(),
    initialMargin: im.toString(),
    maintenanceMargin: mm.toString(),
    excessOverIM: (balance - im).toString(),
    isHealthy: healthy,
    chainHead: head.toString(),
    units: "vault/token native units (USDC 6 decimals)",
  });
}
