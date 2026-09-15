#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createChainClient } from "./chain.ts";
import { loadConfig, mcpServerName } from "./config.ts";
import { loadDeployments } from "./deployments.ts";
import { listenHttp } from "./http.ts";
import { createServer } from "./server.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const deployments = loadDeployments(config.env);
  const client = createChainClient(config, deployments);
  const banner = `${mcpServerName(config.env)} ${config.env} (${deployments.environment.network}) docs=${config.docsUrl}`;

  if (config.transport === "http") {
    const listener = await listenHttp(config, deployments, client);
    console.log(`${banner} transport=http :${listener.port}/mcp`);
    return;
  }

  const server = createServer(config, deployments, client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${banner} transport=stdio`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
