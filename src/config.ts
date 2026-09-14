export type NetworkEnv = "testnet" | "mainnet";

export interface AppConfig {
  env: NetworkEnv;
  rpcUrl: string;
  docsUrl: string;
}

const DEFAULT_RPC: Record<NetworkEnv, string> = {
  testnet: "https://sepolia.base.org",
  mainnet: "https://mainnet.base.org",
};

const DEFAULT_DOCS: Record<NetworkEnv, string> = {
  testnet: "https://dev.hashpower.io",
  mainnet: "https://hashpower.io",
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw = (env.HASHPOWER_ENV ?? "testnet").toLowerCase();
  if (raw !== "testnet" && raw !== "mainnet") {
    throw new Error(`HASHPOWER_ENV must be testnet or mainnet, got ${JSON.stringify(raw)}`);
  }
  const network = raw;
  return {
    env: network,
    rpcUrl: env.HASHPOWER_RPC_URL?.trim() || DEFAULT_RPC[network],
    docsUrl: (env.HASHPOWER_DOCS_URL?.trim() || DEFAULT_DOCS[network]).replace(/\/$/, ""),
  };
}
