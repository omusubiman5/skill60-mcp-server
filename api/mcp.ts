// Vercel Serverless Function for SKILL60+ MCP Server
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { connectDB } from "../src/services/db.js";
import { registerNewsTools } from "../src/tools/news.js";
import { registerSubsidyTools } from "../src/tools/jgrants.js";
import { registerPensionTools } from "../src/tools/pension.js";
import { registerBenefitTools } from "../src/tools/benefits.js";
import { registerMarketTools } from "../src/tools/market.js";
import { registerHealthTools } from "../src/tools/health.js";
import { registerDialectTools } from "../src/tools/dialect.js";
import { registerBotpressTools } from "../src/integrations/botpress.js";
import { registerVoicevoxTools } from "../src/integrations/voicevox.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

async function createServer(): Promise<McpServer> {
  await connectDB();
  const server = new McpServer({
    name: "skill60-mcp-server",
    version: "3.1.0",
  });
  registerNewsTools(server);
  registerSubsidyTools(server);
  registerPensionTools(server);
  registerBenefitTools(server);
  registerMarketTools(server);
  registerHealthTools(server);
  registerDialectTools(server);
  registerBotpressTools(server);
  registerVoicevoxTools(server);
  return server;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORSヘッダーを設定
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const server = await createServer();
    await server.connect(transport);

    await transport.handleRequest(req, res, (req as any).body);
  } catch (error) {
    console.error("MCP handler error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    }));
  }
}
