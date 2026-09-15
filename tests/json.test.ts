import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asAddress, asUnixSeconds, dumpJson, parseBigIntString, scaleUnits } from "../src/json.ts";

describe("json helpers", () => {
  it("serializes bigint as decimal strings", () => {
    assert.equal(dumpJson({ n: 10n }), '{\n  "n": "10"\n}');
  });

  it("parses signed integer strings", () => {
    assert.equal(parseBigIntString("qty", "-12"), -12n);
  });

  it("rejects decimals", () => {
    assert.throws(() => parseBigIntString("qty", "1.5"));
  });

  it("normalizes addresses", () => {
    assert.equal(
      asAddress("w", "0x54A79e2a5C60ACe37b280eBbCda51b4E903d25F0"),
      "0x54a79e2a5c60ace37b280ebbcda51b4e903d25f0",
    );
  });

  it("scales integer units without scientific notation", () => {
    assert.equal(scaleUnits(3771523091n, 8), "37.71523091");
    assert.equal(scaleUnits(37680000n, 6), "37.68");
    assert.equal(scaleUnits(-1500000n, 6), "-1.5");
    assert.equal(scaleUnits(12n, 0), "12");
  });

  it("collapses Goldsky microsecond timestamps to unix seconds", () => {
    assert.equal(asUnixSeconds("1789502464000000"), "1789502464");
    assert.equal(asUnixSeconds("1789502464"), "1789502464");
  });
});
