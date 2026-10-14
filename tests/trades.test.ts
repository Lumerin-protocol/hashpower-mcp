import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKSTOP_ADDR, tradeTag } from "../src/tools/market.ts";

describe("tradeTag", () => {
  it("tags a backstop assignment ahead of a liquidation flag", () => {
    assert.equal(tradeTag({ isBackstopAssignment: true, isLiquidation: true, userId: "0xabc" }), "backstop");
  });

  it("tags any fill by the backstop ledger", () => {
    assert.equal(
      tradeTag({ isLiquidation: false, userId: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" }),
      "backstop",
    );
    assert.equal(BACKSTOP_ADDR, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("tags a liquidation that is not the backstop", () => {
    assert.equal(tradeTag({ isLiquidation: true, userId: "0x0000000000000000000000000000000000000001" }), "liquidation");
  });

  it("leaves a normal print untagged", () => {
    assert.equal(tradeTag({ isLiquidation: false, userId: "0x0000000000000000000000000000000000000001" }), null);
  });
});
