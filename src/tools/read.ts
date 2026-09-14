import { HashpriceBTCAbi, HashpriceUSDAbi } from "@hashpower/oracle-abi";
import { CollateralVaultAbi, PortfolioMarginEngineAbi } from "@hashpower/collateral-abi";
import { HashPowerFuturesAbi } from "@hashpower/futures-abi";
import { HashPowerPerpsDEXAbi } from "@hashpower/perps-abi";
import { chainHead } from "../chain.ts";
import type { ChainClient } from "../chain.ts";
import type { DeploymentsManifest } from "../deployments.ts";
import { requireContract, requireSubgraph } from "../deployments.ts";
import { graphql, walletId } from "../graphql.ts";
import { asAddress } from "../json.ts";
import { ok } from "./result.ts";

type Client = ChainClient;

const META = ` _meta { block { number } } `;

export async function getHashprice(client: Client, deployments: DeploymentsManifest, pair: "usd" | "btc") {
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
  return ok({
    pair: pair === "usd" ? "HashpriceUSD" : "HashpriceBTC",
    address,
    decimals: Number(decimals),
    roundId: roundId.toString(),
    answer: answer.toString(),
    startedAt: startedAt.toString(),
    updatedAt: updatedAt.toString(),
    answeredInRound: answeredInRound.toString(),
    chainHead: head.toString(),
    note: "Read HashpriceUSD via AggregatorV3 latestRoundData(). Encode your own bot against @hashpower/oracle-abi — do not route trades through this server.",
  });
}

export async function getOrderbook(
  client: Client,
  deployments: DeploymentsManifest,
  venue: "futures" | "perps",
  maxLevels: number,
  expirationAt?: string,
) {
  const contracts = deployments.environment.contracts;
  const head = await chainHead(client);
  if (venue === "perps") {
    const address = requireContract(contracts, "HashPowerPerpsDEX");
    const [bids, asks] = await client.readContract({
      address,
      abi: HashPowerPerpsDEXAbi,
      functionName: "getOrderBookPrices",
      args: [BigInt(maxLevels)],
    });
    return ok({
      venue,
      address,
      maxLevels,
      bids: bids.map((p) => p.toString()),
      asks: asks.map((p) => p.toString()),
      chainHead: head.toString(),
      note: "Prices only (on-chain CLOB view). Quantities are on the perps subgraph PriceLevel entity.",
    });
  }

  if (!expirationAt) {
    throw new Error("expirationAt (unix seconds, integer string) is required for futures order books");
  }
  const address = requireContract(contracts, "HashPowerFutures", "Futures");
  const [bids, asks] = await client.readContract({
    address,
    abi: HashPowerFuturesAbi,
    functionName: "getOrderBookPrices",
    args: [BigInt(expirationAt), BigInt(maxLevels)],
  });
  return ok({
    venue,
    address,
    expirationAt,
    maxLevels,
    bids: bids.map((p) => p.toString()),
    asks: asks.map((p) => p.toString()),
    chainHead: head.toString(),
  });
}

interface OrderRow {
  id: string;
  price: string;
  quantity: string;
  originalQuantity: string;
  isBuy: boolean;
  status: string;
  expirationAt?: string;
}

interface PositionRow {
  id: string;
  netQuantity: string;
  entryPrice: string;
  realizedPnl: string;
  status: string;
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
        _meta?: { block?: { number?: number } };
      }>(
        url,
        `{ ${META}
          orders(first: 50, orderBy: createdAt, orderDirection: desc, where: { user: "${id}", status_in: [ACTIVE, PARTIALLY_FILLED] }) {
            id price quantity originalQuantity isBuy status expirationAt
          }
          positionSessions(first: 20, orderBy: lastTradeAt, orderDirection: desc, where: { user: "${id}", status: OPEN }) {
            id netQuantity entryPrice realizedPnl status expirationAt
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
        `{ ${META}
          orders(first: 50, orderBy: createdAt, orderDirection: desc, where: { user: "${id}", status_in: [ACTIVE, PARTIALLY_FILLED] }) {
            id price quantity originalQuantity isBuy status
          }
          positionSessions(first: 20, orderBy: lastTradeAt, orderDirection: desc, where: { user: "${id}", status: OPEN }) {
            id netQuantity entryPrice realizedPnl status
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
    "Subgraph data can lag the chain head. Connect the trading UI with this same wallet for a live dashboard. This server is not in the trade path.";
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
