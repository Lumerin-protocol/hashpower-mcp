import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChainClient } from "../src/chain.ts";
import { loadConfig } from "../src/config.ts";
import { loadDeployments } from "../src/deployments.ts";
import { listenHttp } from "../src/http.ts";

async function rpc(url: string, method: string, params?: unknown, id = 1): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert.equal(res.ok, true, `HTTP ${res.status} for ${method}`);
  return (await res.json()) as Record<string, unknown>;
}

describe("stateless streamable HTTP", () => {
  it("serves /health and tools/list without a session", async () => {
    const config = loadConfig({ HASHPOWER_TRANSPORT: "http", PORT: "0" });
    const deployments = loadDeployments(config.env);
    const client = createChainClient(config, deployments);
    const listener = await listenHttp(config, deployments, client, 0);
    const origin = `http://127.0.0.1:${listener.port}`;

    try {
      const health = await fetch(`${origin}/health`);
      assert.equal(health.status, 200);
      const body = (await health.json()) as { ok: boolean; mcp: string; version: string; name: string };
      assert.equal(body.ok, true);
      assert.equal(body.mcp, "/mcp");
      assert.equal(body.name, "dev-hashpower");
      assert.equal(typeof body.version, "string");
      assert.ok(body.version.length > 0);

      const init = await rpc(`${origin}/mcp`, "initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "hashpower-mcp-test", version: "0.0.0" },
      });
      assert.equal(init.jsonrpc, "2.0");
      const info = init.result as { serverInfo: { name: string } };
      assert.equal(info.serverInfo.name, "dev-hashpower");

      const listed = await rpc(
        `${origin}/mcp`,
        "tools/list",
        {},
        2,
      );
      const result = listed.result as { tools: { name: string }[] };
      const names = new Set(result.tools.map((t) => t.name));
      assert.ok(names.has("get_deployments"));
      assert.ok(names.has("get_hashprice"));
      assert.ok(names.has("get_market_snapshot"));
      assert.ok(names.has("get_orderbook"));
      assert.ok(names.has("get_trades"));
      assert.ok(names.has("get_funding"));
      assert.ok(names.has("get_expirations"));
      assert.ok(names.has("get_market_stats"));
      assert.ok(names.has("get_oracle_history"));
      assert.ok(names.has("simulate_order"));
      assert.ok(names.has("build_order_tx"));
    } finally {
      await listener.close();
    }
  });
});
