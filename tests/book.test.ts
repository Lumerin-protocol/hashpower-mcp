import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSubgraphLevels, summarizeBook, zipChainLevels } from "../src/tools/book.ts";

describe("order book helpers", () => {
  it("zips chain prices with quantities and summarizes spread/depth", () => {
    const bids = zipChainLevels([37680000n, 37670000n], [100n, 50n]);
    const asks = zipChainLevels([37690000n, 37700000n], [80n, 20n]);
    const summary = summarizeBook(bids, asks);
    assert.equal(summary.bestBid, "37680000");
    assert.equal(summary.bestAsk, "37690000");
    assert.equal(summary.spread, "10000");
    assert.equal(summary.mid, "37685000");
    assert.equal(summary.bidDepth, "150");
    assert.equal(summary.askDepth, "100");
  });

  it("merges subgraph orderCount onto chain levels and reports extras", () => {
    const chain = zipChainLevels([37680000n], [100n]);
    const merged = mergeSubgraphLevels(
      chain,
      [
        { price: "37680000", isBid: true, totalQuantity: "99", orderCount: 2 },
        { price: "37670000", isBid: true, totalQuantity: "40", orderCount: 1 },
      ],
      true,
    );
    assert.equal(merged.levels[0]?.orderCount, 2);
    assert.equal(merged.levels[0]?.subgraphQuantity, "99");
    assert.equal(merged.extra.length, 1);
    assert.equal(merged.extra[0]?.price, "37670000");
  });
});
