export interface BookLevel {
  price: string;
  quantity: string;
  orderCount: number | null;
  subgraphQuantity: string | null;
}

export interface SubgraphLevel {
  price: string;
  isBid: boolean;
  totalQuantity: string;
  orderCount: number;
}

export interface BookSummary {
  bestBid: string | null;
  bestAsk: string | null;
  spread: string | null;
  mid: string | null;
  bidDepth: string;
  askDepth: string;
}

export function zipChainLevels(prices: readonly bigint[], quantities: readonly bigint[]): BookLevel[] {
  return prices.map((price, i) => ({
    price: price.toString(),
    quantity: (quantities[i] ?? 0n).toString(),
    orderCount: null,
    subgraphQuantity: null,
  }));
}

function sideOf(subgraph: SubgraphLevel[], isBid: boolean): SubgraphLevel[] {
  return subgraph.filter((level) => level.isBid === isBid);
}

function sortExtra(levels: BookLevel[], isBid: boolean): BookLevel[] {
  return [...levels].sort((a, b) => {
    const pa = BigInt(a.price);
    const pb = BigInt(b.price);
    if (pa === pb) return 0;
    if (isBid) return pa > pb ? -1 : 1;
    return pa < pb ? -1 : 1;
  });
}

export function mergeSubgraphLevels(
  chain: BookLevel[],
  subgraph: SubgraphLevel[],
  isBid: boolean,
): { levels: BookLevel[]; extra: BookLevel[] } {
  const byPrice = new Map(sideOf(subgraph, isBid).map((level) => [level.price, level]));
  const levels = chain.map((row) => {
    const hit = byPrice.get(row.price);
    if (!hit) return row;
    return {
      ...row,
      orderCount: hit.orderCount,
      subgraphQuantity: hit.totalQuantity,
    };
  });
  const seen = new Set(chain.map((row) => row.price));
  const extra = sortExtra(
    sideOf(subgraph, isBid)
      .filter((level) => !seen.has(level.price))
      .map((level) => ({
        price: level.price,
        quantity: level.totalQuantity,
        orderCount: level.orderCount,
        subgraphQuantity: level.totalQuantity,
      })),
    isBid,
  );
  return { levels, extra };
}

function sumQuantity(levels: BookLevel[]): string {
  let total = 0n;
  for (const level of levels) total += BigInt(level.quantity);
  return total.toString();
}

export function summarizeBook(bids: BookLevel[], asks: BookLevel[]): BookSummary {
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const bid = bestBid === null ? null : BigInt(bestBid);
  const ask = bestAsk === null ? null : BigInt(bestAsk);
  let spread: string | null = null;
  let mid: string | null = null;
  if (bid !== null && ask !== null) {
    spread = (ask - bid).toString();
    mid = ((bid + ask) / 2n).toString();
  }
  return {
    bestBid,
    bestAsk,
    spread,
    mid,
    bidDepth: sumQuantity(bids),
    askDepth: sumQuantity(asks),
  };
}

export function freshness(chainHead: bigint, subgraphHead: number | null) {
  return {
    chainHead: chainHead.toString(),
    subgraphHead,
    lagBlocks: subgraphHead === null ? null : Number(chainHead) - subgraphHead,
  };
}

export async function settled<T>(
  label: string,
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `${label}: ${message}` };
  }
}
