#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createChainClient } from "./chain.ts";
import { loadConfig } from "./config.ts";
import { loadDeployments } from "./deployments.ts";
import { createServer } from "./server.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const deployments = loadDeployments(config.env);
  const client = createChainClient(config, deployments);
  const server = createServer(config, deployments, client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `hashpower MCP ${config.env} (${deployments.environment.network}) docs=${config.docsUrl}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
