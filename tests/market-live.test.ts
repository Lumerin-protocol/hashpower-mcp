import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChainClient } from "../src/chain.ts";
import { loadConfig } from "../src/config.ts";
import { loadDeployments } from "../src/deployments.ts";
import { loadOracleHistory, loadTrades } from "../src/tools/market.ts";
import { loadOrderbook } from "../src/tools/read.ts";

describe("live market reads", () => {
  const deployments = loadDeployments("testnet");

  it("reads perps book depth from chain quantities plus subgraph orderCount", async () => {
    const config = loadConfig();
    const client = createChainClient(config, deployments);
    const book = await loadOrderbook(client, deployments, "perps", 3);
    assert.equal(book.venue, "perps");
    assert.ok(book.bids.length + book.asks.length > 0);
    const top = book.bids[0] ?? book.asks[0];
    assert.ok(top);
    assert.match(top.quantity, /^\d+$/);
    assert.notEqual(top.quantity, "0");
  });

  it("reads the perps tape from the public subgraph", async () => {
    const tape = await loadTrades(deployments, "perps", 3);
    assert.equal(tape.venue, "perps");
    assert.ok(Array.isArray(tape.trades));
    assert.ok(tape.subgraphHead === null || tape.subgraphHead > 0);
  });

  it("reads hashprice USD hourly candles from the oracles subgraph", async () => {
    const history = await loadOracleHistory(deployments, "hashpriceUsd", "hour", 4);
    assert.equal(history.series, "hashpriceUsd");
    assert.ok("candles" in history);
    const candles = "candles" in history ? history.candles : [];
    assert.ok(candles.length > 0);
    assert.ok(candles[0]?.close);
    assert.ok(candles[0]?.timestampUnix);
  });
});
