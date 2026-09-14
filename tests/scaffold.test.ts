import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadDeployments } from "../src/deployments.ts";
import { buildDepositTx, buildOrderTx } from "../src/tools/scaffold.ts";

describe("scaffold calldata", () => {
  const deployments = loadDeployments("testnet");

  it("builds approve + deposit steps", () => {
    const result = buildDepositTx(deployments, "1000000") as {
      content: { text: string }[];
    };
    const body = JSON.parse(result.content[0].text) as {
      steps: { to: string; data: string }[];
    };
    assert.equal(body.steps.length, 2);
    assert.ok(body.steps[0].data.startsWith("0x"));
    assert.ok(body.steps[1].data.startsWith("0x"));
  });

  it("builds perps createOrder without expiration", () => {
    const result = buildOrderTx(deployments, {
      venue: "perps",
      price: "1000000",
      quantity: "1000000",
      timeInForce: "GTC",
    }) as { content: { text: string }[] };
    const body = JSON.parse(result.content[0].text) as { to: string; data: string };
    assert.equal(body.to.toLowerCase(), deployments.environment.contracts.HashPowerPerpsDEX.toLowerCase());
    assert.ok(body.data.startsWith("0x"));
  });

  it("requires expirationAt for futures", () => {
    assert.throws(() =>
      buildOrderTx(deployments, {
        venue: "futures",
        price: "1",
        quantity: "1",
        timeInForce: "GTC",
      }),
    );
  });
});
