import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadDeployments, requireContract } from "../src/deployments.ts";

describe("loadDeployments", () => {
  it("merges the four published ABI packages for testnet", () => {
    const manifest = loadDeployments("testnet");
    assert.equal(manifest.environment.chainId, 84532);
    assert.ok(requireContract(manifest.environment.contracts, "HashpriceUSD"));
    assert.ok(requireContract(manifest.environment.contracts, "CollateralVault"));
    assert.ok(requireContract(manifest.environment.contracts, "HashPowerFutures", "Futures"));
    assert.ok(requireContract(manifest.environment.contracts, "HashPowerPerpsDEX"));
    assert.ok(manifest.environment.subgraphs.futures);
    assert.ok(manifest.environment.subgraphs.perps);
    assert.ok(manifest.packages["@hashpower/oracle-abi"]?.version);
  });
});
