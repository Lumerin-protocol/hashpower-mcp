export type NetworkEnv = "testnet" | "mainnet";
export type TransportKind = "stdio" | "http";
export type McpServerName = "dev-hashpower" | "hashpower";

export interface AppConfig {
  env: NetworkEnv;
  rpcUrl: string;
  docsUrl: string;
  transport: TransportKind;
  port: number;
}

/** Cursor / MCP client key. Testnet stays off the production `hashpower` name. */
export function mcpServerName(env: NetworkEnv): McpServerName {
  return env === "mainnet" ? "hashpower" : "dev-hashpower";
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
  const transportRaw = (env.HASHPOWER_TRANSPORT ?? "stdio").toLowerCase();
  if (transportRaw !== "stdio" && transportRaw !== "http") {
    throw new Error(`HASHPOWER_TRANSPORT must be stdio or http, got ${JSON.stringify(transportRaw)}`);
  }
  const portRaw = env.PORT?.trim() || env.HASHPOWER_PORT?.trim() || "8080";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer 0-65535, got ${JSON.stringify(portRaw)}`);
  }
  return {
    env: network,
    rpcUrl: env.HASHPOWER_RPC_URL?.trim() || DEFAULT_RPC[network],
    docsUrl: (env.HASHPOWER_DOCS_URL?.trim() || DEFAULT_DOCS[network]).replace(/\/$/, ""),
    transport: transportRaw,
    port,
  };
}
