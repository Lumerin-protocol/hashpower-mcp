import { HashPowerFuturesAbi } from "@hashpower/futures-abi";
import { HashPowerPerpsDEXAbi } from "@hashpower/perps-abi";
import { chainHead } from "../chain.ts";
import type { ChainClient } from "../chain.ts";
import type { DeploymentsManifest } from "../deployments.ts";
import { requireContract, requireSubgraph } from "../deployments.ts";
import { graphql, META_BLOCK, walletId } from "../graphql.ts";
import { asAddress, asUnixSeconds, scaleUnits } from "../json.ts";
import { freshness, settled } from "./book.ts";
import { loadHashprice, loadOrderbook } from "./read.ts";
import { ok } from "./result.ts";

type Client = ChainClient;

export type OracleSeries = "hashpriceUsd" | "hashpriceBtc" | "btcUsd" | "networkHashrate1d" | "networkHashrate7d";
export type OracleInterval = "tick" | "hour" | "day";

interface TradeRow {
  id: string;
  tradePrice: string;
  tradeQuantity: string;
  timestamp: string;
  transactionHash: string;
  isLiquidation?: boolean;
  expirationAt?: string;
  user?: { id?: string; address?: string };
}

interface FundingUpdateRow {
  id: string;
  fundingRate: string;
  cumulativeFundingPerUnit: string;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
}

interface FundingSettlementRow {
  id: string;
  amount: string;
  timestamp: string;
  transactionHash: string;
}

interface PerpsStatsRow {
  quantityDecimals: number;
  minimumPriceIncrement: string;
  makerFeeBps: number;
  takerFeeBps: number;
  fundingPeriod: string;
  fundingRateMaxBps: string;
  cumulativeFundingPerUnit: string;
  lastFundingUpdateTime: string;
  minimumMarginPerOrder: string;
  reservePoolBalance: string;
  collectedFeesBalance: string;
  totalUsers: number;
  totalOrders: number;
  activeOrders: number;
  totalTrades: number;
  totalVolume: string;
  totalLiquidations: number;
  lastUpdatedAt: string;
}

interface FuturesStatsRow {
  quantityDecimals: number;
  minimumPriceIncrement: string;
  makerFeeBps: number;
  takerFeeBps: number;
  contractSizeHpsDay: string;
  expirationIntervalDays: number;
  futureExpirationDatesCount: number;
  firstFutureExpirationDate: string;
  collectedFeesBalance: string;
  totalUsers: number;
  totalOrders: number;
  activeOrders: number;
  totalTrades: number;
  totalVolume: string;
  totalLiquidations: number;
  lastUpdatedAt: string;
}

interface ExpirationRow {
  expirationAt: string;
  settlementPrice: string | null;
  settledAt: string | null;
}

interface LatestRatesRow {
  hashpriceBtcPrice: string | null;
  hashpriceBtcUpdatedAt: string | null;
  btcUsdPrice: string | null;
  btcUsdUpdatedAt: string | null;
  networkHashrate1dHpS: string | null;
  networkHashrate7dHpS: string | null;
}

interface HashpriceMetaRow {
  hashpriceUsdDecimals: string;
  hashpriceBtcDecimals: string;
  btcUsdDecimals: string;
}

const SERIES: Record<
  OracleSeries,
  { ticks: string; candles: string; valueField: "price" | "hashrateHpS"; decimalsField?: keyof HashpriceMetaRow }
> = {
  hashpriceUsd: {
    ticks: "hashpriceUsds",
    candles: "hashpriceUsdCandles",
    valueField: "price",
    decimalsField: "hashpriceUsdDecimals",
  },
  hashpriceBtc: {
    ticks: "hashpriceBtcs",
    candles: "hashpriceBtcCandles",
    valueField: "price",
    decimalsField: "hashpriceBtcDecimals",
  },
  btcUsd: {
    ticks: "btcUsds",
    candles: "btcUsdCandles",
    valueField: "price",
    decimalsField: "btcUsdDecimals",
  },
  networkHashrate1d: { ticks: "networkHashrate1Ds", candles: "networkHashrate1DCandles", valueField: "hashrateHpS" },
  networkHashrate7d: { ticks: "networkHashrate7Ds", candles: "networkHashrate7DCandles", valueField: "hashrateHpS" },
};

export async function loadTrades(
  deployments: DeploymentsManifest,
  venue: "futures" | "perps",
  first: number,
  wallet?: string,
) {
  const url = requireSubgraph(deployments.environment.subgraphs, venue);
  const extra = venue === "futures" ? "expirationAt" : "isLiquidation";
  const where = wallet ? `, where: { user: "${walletId(asAddress("wallet", wallet))}" }` : "";
  const { data, meta } = await graphql<{ trades: TradeRow[] }>(
    url,
    `{ ${META_BLOCK}
      trades(first: ${first}, orderBy: timestamp, orderDirection: desc${where}) {
        id tradePrice tradeQuantity timestamp transactionHash ${extra}
        user { id }
      }
    }`,
  );
  return {
    venue,
    wallet: wallet ? asAddress("wallet", wallet) : null,
    subgraphHead: meta.blockNumber,
    trades: data.trades.map((row) => ({
      id: row.id,
      price: row.tradePrice,
      quantity: row.tradeQuantity,
      side: BigInt(row.tradeQuantity) >= 0n ? "buy" : "sell",
      timestamp: row.timestamp,
      transactionHash: row.transactionHash,
      isLiquidation: row.isLiquidation ?? false,
      expirationAt: row.expirationAt,
      user: row.user?.id ?? null,
    })),
    note: "Same Trade entity the UI Recent Trades tab uses. Each row is one user's side of a match (a two-sided print appears twice). Signed quantity: positive = buy/long, negative = sell/short.",
  };
}

export async function getTrades(
  deployments: DeploymentsManifest,
  venue: "futures" | "perps",
  first: number,
  wallet?: string,
) {
  return ok(await loadTrades(deployments, venue, first, wallet));
}

export async function loadFunding(
  client: Client,
  deployments: DeploymentsManifest,
  first: number,
  wallet?: string,
) {
  const url = requireSubgraph(deployments.environment.subgraphs, "perps");
  const address = requireContract(deployments.environment.contracts, "HashPowerPerpsDEX");
  const head = await chainHead(client);
  const walletAddr = wallet ? asAddress("wallet", wallet) : null;

  const [{ data, meta }, pending] = await Promise.all([
    graphql<{ perps: PerpsStatsRow | null; fundingUpdates: FundingUpdateRow[]; fundingSettlements?: FundingSettlementRow[] }>(
      url,
      `{ ${META_BLOCK}
        perps(id: 0) {
          fundingPeriod fundingRateMaxBps cumulativeFundingPerUnit lastFundingUpdateTime
        }
        fundingUpdates(first: ${first}, orderBy: timestamp, orderDirection: desc) {
          id fundingRate cumulativeFundingPerUnit timestamp blockNumber transactionHash
        }
        ${
          walletAddr
            ? `fundingSettlements(first: 20, orderBy: timestamp, orderDirection: desc, where: { user: "${walletId(walletAddr)}" }) {
                 id amount timestamp transactionHash
               }`
            : ""
        }
      }`,
    ),
    walletAddr
      ? client.readContract({
          address,
          abi: HashPowerPerpsDEXAbi,
          functionName: "getPendingFunding",
          args: [walletAddr],
        })
      : Promise.resolve(null),
  ]);

  const latest = data.fundingUpdates[0] ?? null;
  return {
    address,
    ...freshness(head, meta.blockNumber),
    contract: data.perps,
    latestUpdate: latest,
    updates: data.fundingUpdates,
    wallet: walletAddr
      ? {
          wallet: walletAddr,
          pendingFunding: pending === null ? null : pending.toString(),
          settlements: data.fundingSettlements ?? [],
        }
      : null,
    note: "Perps-only. fundingRate is 1e18-scaled (UI shows fundingRate/1e18 as a decimal, then *100 for percent). Pass wallet to include getPendingFunding (chain) and recent FundingSettlement rows (subgraph).",
  };
}

export async function getFunding(client: Client, deployments: DeploymentsManifest, first: number, wallet?: string) {
  return ok(await loadFunding(client, deployments, first, wallet));
}

export async function loadExpirations(client: Client, deployments: DeploymentsManifest, nowUnix?: number) {
  const address = requireContract(deployments.environment.contracts, "HashPowerFutures", "Futures");
  const url = requireSubgraph(deployments.environment.subgraphs, "futures");
  const head = await chainHead(client);
  const now = nowUnix ?? Math.floor(Date.now() / 1000);

  const [dates, subgraph] = await Promise.all([
    client.readContract({
      address,
      abi: HashPowerFuturesAbi,
      functionName: "getExpirationDates",
    }),
    graphql<{ futuresExpirations: ExpirationRow[] }>(
      url,
      `{ ${META_BLOCK}
        futuresExpirations(first: 50, orderBy: expirationAt, orderDirection: asc) {
          expirationAt settlementPrice settledAt
        }
      }`,
    ),
  ]);

  const byExpiry = new Map(subgraph.data.futuresExpirations.map((row) => [row.expirationAt, row]));
  const all = dates.map((value) => {
    const expirationAt = value.toString();
    const row = byExpiry.get(expirationAt);
    const unix = Number(expirationAt);
    return {
      expirationAt,
      tradable: unix >= now,
      settlementPrice: row?.settlementPrice ?? null,
      settledAt: row?.settledAt ?? null,
    };
  });

  return {
    address,
    now: now.toString(),
    ...freshness(head, subgraph.meta.blockNumber),
    tradable: all.filter((row) => row.tradable),
    expired: all.filter((row) => !row.tradable),
    subgraphExpirations: subgraph.data.futuresExpirations,
    note: "On-chain getExpirationDates is the market-selector list the UI uses; past dates at the front of the rolling window are dropped here the same way. Pass expirationAt into get_orderbook / simulate_order / build_order_tx.",
  };
}

export async function getExpirations(client: Client, deployments: DeploymentsManifest) {
  return ok(await loadExpirations(client, deployments));
}

export async function loadMarketStats(
  client: Client,
  deployments: DeploymentsManifest,
  venue: "futures" | "perps" | "both",
) {
  const head = await chainHead(client);
  const venues = venue === "both" ? (["futures", "perps"] as const) : ([venue] as const);
  const out: Record<string, unknown> = { chainHead: head.toString() };

  for (const v of venues) {
    const url = requireSubgraph(deployments.environment.subgraphs, v);
    if (v === "perps") {
      const address = requireContract(deployments.environment.contracts, "HashPowerPerpsDEX");
      const [{ data, meta }, marketPrice] = await Promise.all([
        graphql<{ perps: PerpsStatsRow | null }>(
          url,
          `{ ${META_BLOCK}
            perps(id: 0) {
              quantityDecimals minimumPriceIncrement makerFeeBps takerFeeBps
              fundingPeriod fundingRateMaxBps cumulativeFundingPerUnit lastFundingUpdateTime
              minimumMarginPerOrder reservePoolBalance collectedFeesBalance
              totalUsers totalOrders activeOrders totalTrades totalVolume totalLiquidations lastUpdatedAt
            }
          }`,
        ),
        client.readContract({ address, abi: HashPowerPerpsDEXAbi, functionName: "getMarketPrice" }),
      ]);
      out.perps = {
        address,
        marketPrice: marketPrice.toString(),
        ...data.perps,
        ...freshness(head, meta.blockNumber),
      };
    } else {
      const address = requireContract(deployments.environment.contracts, "HashPowerFutures", "Futures");
      const [{ data, meta }, marketPrice] = await Promise.all([
        graphql<{ futures: FuturesStatsRow | null }>(
          url,
          `{ ${META_BLOCK}
            futures(id: 0) {
              quantityDecimals minimumPriceIncrement makerFeeBps takerFeeBps
              contractSizeHpsDay expirationIntervalDays futureExpirationDatesCount firstFutureExpirationDate
              collectedFeesBalance totalUsers totalOrders activeOrders totalTrades totalVolume totalLiquidations lastUpdatedAt
            }
          }`,
        ),
        client.readContract({ address, abi: HashPowerFuturesAbi, functionName: "getMarketPrice" }),
      ]);
      out.futures = {
        address,
        marketPrice: marketPrice.toString(),
        ...data.futures,
        ...freshness(head, meta.blockNumber),
      };
    }
  }

  out.note =
    "Singleton stats the UI footer/spec strip reads (perps(id:0) / futures(id:0)) plus on-chain getMarketPrice. Subgraph totals can lag chainHead.";
  return out;
}

export async function getMarketStats(
  client: Client,
  deployments: DeploymentsManifest,
  venue: "futures" | "perps" | "both",
) {
  return ok(await loadMarketStats(client, deployments, venue));
}

function scaleOracleValue(raw: string, decimals: number | null): string | null {
  if (decimals === null) return null;
  return scaleUnits(BigInt(raw), decimals);
}

export async function loadOracleHistory(
  deployments: DeploymentsManifest,
  series: OracleSeries,
  interval: OracleInterval,
  first: number,
) {
  const url = requireSubgraph(deployments.environment.subgraphs, "oracles");
  const spec = SERIES[series];
  const { data: metaData } = await graphql<{ hashpriceMeta: HashpriceMetaRow | null; latestRates: LatestRatesRow | null }>(
    url,
    `{ ${META_BLOCK}
      hashpriceMeta(id: 0) { hashpriceUsdDecimals hashpriceBtcDecimals btcUsdDecimals }
      latestRates(id: 0) {
        hashpriceBtcPrice hashpriceBtcUpdatedAt
        btcUsdPrice btcUsdUpdatedAt
        networkHashrate1dHpS networkHashrate7dHpS
      }
    }`,
  );
  const decimalsRaw = spec.decimalsField ? metaData.hashpriceMeta?.[spec.decimalsField] : undefined;
  const decimals = decimalsRaw === undefined ? null : Number(decimalsRaw);

  if (interval === "tick") {
    const valueSel = spec.valueField === "price" ? "price" : "hashrateHpS";
    const { data, meta } = await graphql<Record<string, Record<string, string>[]>>(
      url,
      `{ ${META_BLOCK}
        ${spec.ticks}(first: ${first}, orderBy: timestamp, orderDirection: desc) {
          ${valueSel} timestamp blockNumber
        }
      }`,
    );
    const rows = data[spec.ticks] ?? [];
    return {
      series,
      interval,
      decimals,
      subgraphHead: meta.blockNumber,
      latestRates: metaData.latestRates,
      points: rows.map((row) => {
        const value = row[spec.valueField];
        return {
          value,
          scaled: value ? scaleOracleValue(value, decimals) : null,
          timestampUnix: asUnixSeconds(row.timestamp),
          timestampRaw: row.timestamp,
          blockNumber: row.blockNumber,
        };
      }),
      note: "Goldsky timeseries timestamps are microseconds. scaled uses HashpriceMeta decimals when the series is a price.",
    };
  }

  const { data, meta } = await graphql<Record<string, Record<string, string>[]>>(
    url,
    `{ ${META_BLOCK}
      ${spec.candles}(interval: "${interval}", first: ${first}, current: include, orderBy: timestamp, orderDirection: desc) {
        open high low close sum count timestamp
      }
    }`,
  );
  const rows = data[spec.candles] ?? [];
  return {
    series,
    interval,
    decimals,
    subgraphHead: meta.blockNumber,
    latestRates: metaData.latestRates,
    candles: rows.map((row) => ({
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      openScaled: scaleOracleValue(row.open, decimals),
      highScaled: scaleOracleValue(row.high, decimals),
      lowScaled: scaleOracleValue(row.low, decimals),
      closeScaled: scaleOracleValue(row.close, decimals),
      sum: row.sum,
      count: row.count,
      timestampUnix: asUnixSeconds(row.timestamp),
      timestampRaw: row.timestamp,
    })),
    note: "Same hashpriceUsdCandles (and sibling aggregations) the trading UI chart uses. interval is Goldsky hour|day; current: include keeps the in-progress bucket.",
  };
}

export async function getOracleHistory(
  deployments: DeploymentsManifest,
  series: OracleSeries,
  interval: OracleInterval,
  first: number,
) {
  return ok(await loadOracleHistory(deployments, series, interval, first));
}

export async function getMarketSnapshot(
  client: Client,
  deployments: DeploymentsManifest,
  args: { maxLevels: number; trades: number; expirationAt?: string },
) {
  const expirations = await loadExpirations(client, deployments);
  const nearest = args.expirationAt ?? expirations.tradable[0]?.expirationAt;

  const [hashprice, perpsBook, futuresBook, perpsStats, futuresStats, perpsTrades, futuresTrades, funding, oracle] =
    await Promise.all([
      settled("hashprice", loadHashprice(client, deployments, "usd")),
      settled("perpsBook", loadOrderbook(client, deployments, "perps", args.maxLevels)),
      nearest
        ? settled("futuresBook", loadOrderbook(client, deployments, "futures", args.maxLevels, nearest))
        : Promise.resolve({ ok: true as const, value: null }),
      settled("perpsStats", loadMarketStats(client, deployments, "perps")),
      settled("futuresStats", loadMarketStats(client, deployments, "futures")),
      settled("perpsTrades", loadTrades(deployments, "perps", args.trades)),
      settled("futuresTrades", loadTrades(deployments, "futures", args.trades)),
      settled("funding", loadFunding(client, deployments, 5)),
      settled("oracle", loadOracleHistory(deployments, "hashpriceUsd", "hour", 24)),
    ]);

  return ok({
    scannedAt: Math.floor(Date.now() / 1000).toString(),
    note: "One-shot scan of the same surfaces a human reads on the trading UI (oracle strip, perps book+tape+funding, futures expiries+book+tape, venue stats). Form a strategy from this plus the human's goals, then simulate_order / check_can_place_order. Execute separately by encoding @hashpower/*-abi from your own wallet — this server never signs.",
    hashprice,
    perps: {
      book: perpsBook,
      stats: perpsStats,
      trades: perpsTrades,
      funding,
    },
    futures: {
      expirations: { ok: true, value: expirations },
      nearestExpirationAt: nearest ?? null,
      book: futuresBook,
      stats: futuresStats,
      trades: futuresTrades,
    },
    oracleHourly: oracle,
  });
}
