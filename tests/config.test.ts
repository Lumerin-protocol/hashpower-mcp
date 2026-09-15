import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  it("defaults to testnet + public Base Sepolia RPC", () => {
    const cfg = loadConfig({});
    assert.equal(cfg.env, "testnet");
    assert.equal(cfg.rpcUrl, "https://sepolia.base.org");
    assert.equal(cfg.docsUrl, "https://dev.hashpower.io");
    assert.equal(cfg.transport, "stdio");
    assert.equal(cfg.port, 8080);
  });

  it("maps mainnet defaults", () => {
    const cfg = loadConfig({ HASHPOWER_ENV: "mainnet" });
    assert.equal(cfg.env, "mainnet");
    assert.equal(cfg.rpcUrl, "https://mainnet.base.org");
    assert.equal(cfg.docsUrl, "https://hashpower.io");
  });

  it("enables streamable HTTP when HASHPOWER_TRANSPORT=http", () => {
    const cfg = loadConfig({ HASHPOWER_TRANSPORT: "http", PORT: "0" });
    assert.equal(cfg.transport, "http");
    assert.equal(cfg.port, 0);
  });

  it("strips trailing slash on docs URL", () => {
    const cfg = loadConfig({ HASHPOWER_DOCS_URL: "https://example.test/" });
    assert.equal(cfg.docsUrl, "https://example.test");
  });
});
