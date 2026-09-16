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

/** Initialize / server description. Names this instance; lists the other venue. */
export function mcpInstructions(env: NetworkEnv, docsUrl: string): string {
  const name = mcpServerName(env);
  const clientKeyLine =
    env === "mainnet"
      ? 'Client key: this instance is "hashpower" at https://mcp.hashpower.io/mcp (Base mainnet). Testnet is "dev-hashpower" at https://mcp.dev.hashpower.io/mcp.'
      : 'Client key: this instance is "dev-hashpower" at https://mcp.dev.hashpower.io/mcp (Base Sepolia). Reserve "hashpower" for https://mcp.hashpower.io/mcp (Base mainnet).';
  return `You are connected to ${name} (${env}) - a knowledge base, live market scanner, and simulator. It is NOT a trading API and never holds keys.

Hashpower is a permissionless marketplace for Bitcoin hashprice risk on Base. The contracts and subgraphs ARE the API.

How to work:
1. Scan the market the way a human scans the trading UI. Start with get_market_snapshot, or compose get_hashprice, get_orderbook (price + size + orderCount), get_trades, get_funding, get_expirations, get_market_stats, and get_oracle_history.
2. Read the operator's goals together with get_market_rules / get_margin_model / get_units_and_scaling.
3. Form a strategy. Validate with simulate_order and check_can_place_order (and get_margin_status / get_positions when a wallet is in play).
4. Recommend the trade, or execute separately: import @hashpower/*-abi, encode calldata, sign and broadcast from the operator's wallet. Never ask this server to send a transaction or accept a private key.

Hard rules:
- Wallet addresses are tool parameters. This server has no session and no stickiness.
- Prerequisite: Base ETH for gas and USDC for collateral. A local executor approve+deposits to CollateralVault before trading. Collateral is unified across futures and perps. Never send the private key here.
- Subgraphs can lag; every market read reports chainHead vs subgraphHead.
- Scaffold tools (build_*_tx) are prototypes only. Production bots encode via the npm packages.
- Start with get_deployments if you need addresses, subgraph URLs, or ABI package versions.
- ${clientKeyLine}
- Full instruction manual: ${docsUrl}/build/mcp.md`;
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
