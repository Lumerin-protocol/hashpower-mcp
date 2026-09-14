import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { AppConfig } from "./config.ts";
import type { DeploymentsManifest } from "./deployments.ts";

export function createChainClient(config: AppConfig, deployments: DeploymentsManifest) {
  const chain = config.env === "mainnet" ? base : baseSepolia;
  if (chain.id !== deployments.environment.chainId) {
    throw new Error(
      `RPC chain mismatch: deployments say ${deployments.environment.chainId}, config env is ${config.env}`,
    );
  }
  return createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });
}

export type ChainClient = ReturnType<typeof createChainClient>;

export async function chainHead(client: { getBlockNumber: () => Promise<bigint> }): Promise<bigint> {
  return client.getBlockNumber();
}
