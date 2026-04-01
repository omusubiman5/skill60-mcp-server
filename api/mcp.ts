// Vercel Serverless Function for SKILL60+ MCP Server
import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { connectDB } from "../src/services/db.js";
import { registerNewsTools } from "../src/tools/news.js";
import { registerSubsidyTools } from "../src/tools/jgrants.js";
import { registerPensionTools } from "../src/tools/pension.js";
import { registerMarketTools } from "../src/tools/market.js";
import { registerHealthTools } from "../src/tools/health.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

/**
 * Vercel Functions の IncomingMessage から body を文字列として読み取る
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * survibe-ai-season3 側の独自形式 { tool, params } を
 * JSON-RPC 2.0 形式に変換する互換レイヤー
 */
function normalizeToJsonRpc(body: unknown): unknown {
  if (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "tool" in (body as Record<string, unknown>)
  ) {
    const { tool, params } = body as { tool: string; params?: unknown };
    return {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: tool,
        arguments: params ?? {},
      },
      id: 1,
    };
  }
  return body;
}

async function createServer(): Promise<McpServer> {
  await connectDB();
  const server = new McpServer({
    name: "skill60-mcp-server",
    version: "4.0.0",
  });
  registerNewsTools(server);
  registerSubsidyTools(server);
  registerPensionTools(server);
  registerMarketTools(server);
  registerHealthTools(server);
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
    // Vercel Functions では req.body が自動付与されないため手動でパースする
    let parsedBody: unknown = undefined;
    if (req.method === "POST") {
      const rawBody = await readBody(req);
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          // survibe-ai-season3 側のカスタム形式 { tool, params } を JSON-RPC 2.0 に変換
          parsedBody = normalizeToJsonRpc(parsed);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Parse error: invalid JSON" },
            id: null,
          }));
          return;
        }
      }
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const server = await createServer();
    await server.connect(transport);

    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error("MCP handler error:", errMsg, errStack);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: `Internal server error: ${errMsg}` },
        id: null,
      }));
    }
  }
}
