// SKILL60+ MCP Server v4.0 - 実APIデータ取得版
// 全ての情報を実際のAPIからリアルタイム取得
// LLM処理は全て削除。MCPは純粋なデータ取得サーバーとして機能
//
// ツール一覧:
// 1. skill60_fetch_news      - NHK/Yahoo RSSリアルタイム取得
// 2. skill60_search_jgrants  - jGrants API 補助金リアルタイム検索
// 3. skill60_jgrants_detail  - jGrants API 補助金詳細取得
// 4. skill60_pension_law     - e-Gov法令API 年金条文取得
// 5. skill60_job_search      - 求人ボックスAPI 求人検索
// 6. skill60_health_stats    - e-Stat API 健康統計取得
// 7. skill60_weather         - 気象庁API 天気予報取得

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { connectDB, closeDB } from "./services/db.js";
import { registerNewsTools } from "./tools/news.js";
import { registerSubsidyTools } from "./tools/jgrants.js";
import { registerPensionTools } from "./tools/pension.js";
import { registerMarketTools } from "./tools/market.js";
import { registerHealthTools } from "./tools/health.js";

const server = new McpServer({
  name: "skill60-mcp-server",
  version: "4.0.0",
});

// MongoDB 接続
await connectDB();

// 全ツール登録
registerNewsTools(server);
registerSubsidyTools(server);
registerPensionTools(server);
registerMarketTools(server);
registerHealthTools(server);

// stdio
async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SKILL60+ MCP Server v4.0 (REAL API - NO LLM) running on stdio");
  console.error("7 tools: news, jgrants x2, pension_law, job_search, health_stats, weather");
}

// HTTP（Hostinger VPS用）
async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: "skill60-mcp-server",
      version: "4.0.0",
      mode: "REAL_API_NO_LLM",
      tools: 7,
      architecture: "v4.0 - Real API data retrieval (e-Gov, e-Stat, jGrants, KyujinBox, JMA)"
    });
  });

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3100");
  app.listen(port, () => {
    console.error(`SKILL60+ MCP Server v4.0 (REAL API) on http://localhost:${port}/mcp`);
  });
}

const mode = process.env.TRANSPORT || "stdio";
if (mode === "http") {
  runHTTP().catch(e => { console.error(e); process.exit(1); });
} else {
  runStdio().catch(e => { console.error(e); process.exit(1); });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.error("\nShutting down...");
  await closeDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("\nShutting down...");
  await closeDB();
  process.exit(0);
});
