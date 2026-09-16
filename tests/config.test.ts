import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig, mcpInstructions, mcpServerName } from "../src/config.ts";

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

  it("reserves hashpower for mainnet and names testnet dev-hashpower", () => {
    assert.equal(mcpServerName("testnet"), "dev-hashpower");
    assert.equal(mcpServerName("mainnet"), "hashpower");
  });

  it("names this instance in initialize instructions", () => {
    const testnet = mcpInstructions("testnet", "https://dev.hashpower.io");
    assert.match(testnet, /You are connected to dev-hashpower \(testnet\)/);
    assert.match(testnet, /this instance is "dev-hashpower"/);
    assert.match(testnet, /https:\/\/dev\.hashpower\.io\/build\/mcp\.md/);

    const mainnet = mcpInstructions("mainnet", "https://hashpower.io");
    assert.match(mainnet, /You are connected to hashpower \(mainnet\)/);
    assert.match(mainnet, /this instance is "hashpower"/);
    assert.match(mainnet, /https:\/\/hashpower\.io\/build\/mcp\.md/);
    assert.doesNotMatch(mainnet, /Reserve "hashpower"/);
  });
});
