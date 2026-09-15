import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpServerName, type AppConfig } from "./config.ts";
import type { ChainClient } from "./chain.ts";
import type { DeploymentsManifest } from "./deployments.ts";
import { createServer } from "./server.ts";
import { MCP_VERSION } from "./version.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
};

function pathnameOf(req: IncomingMessage): string {
  const host = req.headers.host ?? "localhost";
  try {
    return new URL(req.url ?? "/", `http://${host}`).pathname;
  } catch {
    return "/";
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendMethodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, {
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
}

export interface HttpListener {
  close: () => Promise<void>;
  port: number;
}

/**
 * Stateless Streamable HTTP. Every request gets a fresh MCP server + transport.
 * No Mcp-Session-Id, no sticky sessions — any task can serve any call.
 */
export function listenHttp(
  config: AppConfig,
  deployments: DeploymentsManifest,
  client: ChainClient,
  port = config.port,
): Promise<HttpListener> {
  const httpServer = createHttpServer((req, res) => {
    void handle(req, res, config, deployments, client);
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "0.0.0.0", () => {
      const address = httpServer.address();
      const bound = typeof address === "object" && address ? address.port : port;
      resolve({
        port: bound,
        close: () =>
          new Promise((resClose, rejClose) => {
            httpServer.close((err) => (err ? rejClose(err) : resClose()));
          }),
      });
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  config: AppConfig,
  deployments: DeploymentsManifest,
  client: ChainClient,
): Promise<void> {
  const path = pathnameOf(req);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (path === "/health" || path === "/") {
    sendJson(res, 200, {
      ok: true,
      name: mcpServerName(config.env),
      package: "hashpower-mcp",
      version: MCP_VERSION,
      env: config.env,
      network: deployments.environment.network,
      docsUrl: config.docsUrl,
      transport: "http",
      mcp: "/mcp",
    });
    return;
  }

  if (path !== "/mcp") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  if (method !== "POST") {
    sendMethodNotAllowed(res);
    return;
  }

  const mcp = createServer(config, deployments, client);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const cleanup = () => {
    void transport.close();
    void mcp.close();
  };
  res.on("close", cleanup);

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    cleanup();
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal server error",
        },
        id: null,
      });
    }
  }
}
