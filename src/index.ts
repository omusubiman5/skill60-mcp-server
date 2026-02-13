// SKILL60+ MCP Server v3.0 - Full Integration
// リアルタイム情報取得 + Claude API + Botpress + VOICEVOX
//
// ツール一覧（13個）:
// 1. skill60_fetch_news         - NHK/Yahoo RSS取得
// 2. skill60_search_jgrants     - jGrants API 補助金検索
// 3. skill60_jgrants_detail     - jGrants API 補助金詳細
// 4. skill60_nenkin_news        - 年金機構 新着情報
// 5. skill60_nenkin_page        - 年金機構 ページ本文
// 6. skill60_fetch_senior_sites - JR/航空 シニア特典
// 7. skill60_scrape_url         - 汎用スクレイパー
// 8. skill60_dialect_convert    - 方言変換（Claude API）
// 9. skill60_yoshiko_voice      - ヨシコの声
// 10. skill60_market_value      - 市場価値・求人検索
// 11. skill60_skill_assess      - スキル市場評価
// 12. skill60_health_info       - 健康情報取得
// 13. skill60_weather_advice    - 天気ベース健康アドバイス
// 14. skill60_text_to_speech    - テキスト音声化（VOICEVOX）

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerNewsTools } from "./tools/news.js";
import { registerSubsidyTools } from "./tools/jgrants.js";
import { registerPensionTools } from "./tools/pension.js";
import { registerBenefitTools } from "./tools/benefits.js";
import { registerDialectTools } from "./tools/dialect.js";
import { registerMarketTools } from "./tools/market.js";
import { registerHealthTools } from "./tools/health.js";
import { registerVoicevoxTools } from "./integrations/voicevox.js";
import { handleBotpressWebhook } from "./integrations/botpress.js";

const server = new McpServer({
  name: "skill60-mcp-server",
  version: "3.0.0",
});

// 全ツール登録
registerNewsTools(server);
registerSubsidyTools(server);
registerPensionTools(server);
registerBenefitTools(server);
registerDialectTools(server);
registerMarketTools(server);
registerHealthTools(server);
registerVoicevoxTools(server);

// stdio
async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SKILL60+ MCP Server v3.0 running on stdio");
  console.error("14 tools: news, jgrants, pension, benefits, dialect, yoshiko, market, skill_assess, health, weather, voicevox");
}

// HTTP（Hostinger VPS用）
async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: "skill60-mcp-server",
      version: "3.0.0",
      mode: "FULL_INTEGRATION",
      tools: 14,
      features: ["news", "jgrants", "pension", "benefits", "dialect", "yoshiko", "market", "health", "voicevox", "botpress"]
    });
  });

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Botpress Webhook エンドポイント
  app.post("/bot", async (req, res) => {
    // MCPツールをMapに変換（簡易実装）
    const mcpTools = new Map();
    // 注: 実際の実装では server.tools を使用
    await handleBotpressWebhook(req, res, mcpTools);
  });

  const port = parseInt(process.env.PORT || "3100");
  app.listen(port, () => {
    console.error(`SKILL60+ MCP Server v3.0 on http://localhost:${port}`);
    console.error(`- MCP endpoint: http://localhost:${port}/mcp`);
    console.error(`- Botpress webhook: http://localhost:${port}/bot`);
    console.error(`- Health check: http://localhost:${port}/health`);
  });
}

const mode = process.env.TRANSPORT || "stdio";
if (mode === "http") {
  runHTTP().catch(e => { console.error(e); process.exit(1); });
} else {
  runStdio().catch(e => { console.error(e); process.exit(1); });
}
