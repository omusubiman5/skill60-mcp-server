// SKILL60+ MCP Server v3.1 - データ取得専用版（LLMなし）
// 全ての情報を実際のサイトからリアルタイム取得
// LLM処理は全て削除。MCPは純粋なデータ取得サーバーとして機能
//
// ツール一覧:
// 1. skill60_fetch_news          - NHK/Yahoo RSSリアルタイム取得
// 2. skill60_search_jgrants      - jGrants API 補助金リアルタイム検索
// 3. skill60_jgrants_detail      - jGrants API 補助金詳細取得
// 4. skill60_nenkin_news         - 年金機構 新着情報リアルタイム取得
// 5. skill60_nenkin_page         - 年金機構 ページ本文取得
// 6. skill60_fetch_senior_sites  - JR/航空 シニア特典サイト一括取得
// 7. skill60_scrape_url          - 任意URL本文取得（汎用スクレイパー）
// 8. skill60_market_value        - 市場価値・求人検索（生データ）
// 9. skill60_health_info         - 健康情報取得（生データ）
// 10. skill60_weather            - 天気予報取得（生データ）
// 11. skill60_dialect_data       - 方言データ取得（生データ）
// 12. skill60_botpress_send      - Botpress送信（生データ）
// 13. skill60_text_to_speech     - 音声合成（VOICEVOX 生データ）

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { connectDB, closeDB, getToolStatus, getRecentErrors } from "./services/db.js";
import { registerNewsTools } from "./tools/news.js";
import { registerSubsidyTools } from "./tools/jgrants.js";
import { registerPensionTools } from "./tools/pension.js";
import { registerBenefitTools } from "./tools/benefits.js";
import { registerMarketTools } from "./tools/market.js";
import { registerHealthTools } from "./tools/health.js";
import { registerDialectTools } from "./tools/dialect.js";
import { registerBotpressTools } from "./integrations/botpress.js";
import { registerVoicevoxTools } from "./integrations/voicevox.js";

const server = new McpServer({
  name: "skill60-mcp-server",
  version: "3.1.0",
});

// MongoDB 接続
await connectDB();

// 全ツール登録
registerNewsTools(server);
registerSubsidyTools(server);
registerPensionTools(server);
registerBenefitTools(server);
registerMarketTools(server);
registerHealthTools(server);
registerDialectTools(server);
registerBotpressTools(server);
registerVoicevoxTools(server);

// Note: Admin tools for error logs and status checking will be added in future release

// stdio
async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SKILL60+ MCP Server v3.1 (DATA ONLY - NO LLM) running on stdio");
  console.error("13 tools: news, jgrants, pension, benefits, market, health, weather, dialect, botpress, voicevox + 2 admin");
}

// HTTP（Hostinger VPS用）
async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: "skill60-mcp-server",
      version: "3.1.0",
      mode: "DATA_ONLY_NO_LLM",
      tools: 13,
      architecture: "v3.1 - Pure data retrieval, LLM processing removed"
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
    console.error(`SKILL60+ MCP Server v3.1 (DATA ONLY) on http://localhost:${port}/mcp`);
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
