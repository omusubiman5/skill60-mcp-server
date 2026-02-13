// SKILL60+ MCP Server v2.1 - サイト参照版 + 方言変換
// 全ての情報を実際のサイトからリアルタイム取得 + Claude APIで方言変換
//
// ツール一覧:
// 1. skill60_fetch_news         - NHK/Yahoo RSSリアルタイム取得
// 2. skill60_search_jgrants     - jGrants API 補助金リアルタイム検索
// 3. skill60_jgrants_detail     - jGrants API 補助金詳細取得
// 4. skill60_nenkin_news        - 年金機構 新着情報リアルタイム取得
// 5. skill60_nenkin_page        - 年金機構 ページ本文取得
// 6. skill60_fetch_senior_sites - JR/航空 シニア特典サイト一括取得
// 7. skill60_scrape_url         - 任意URL本文取得（汎用スクレイパー）
// 8. skill60_dialect_convert    - 方言変換（Claude API / 全国対応）
// 9. skill60_yoshiko_voice      - ヨシコの声（AI友人キャラクター変換）

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { registerNewsTools } from "./tools/news.js";
import { registerSubsidyTools } from "./tools/jgrants.js";
import { registerPensionTools } from "./tools/pension.js";
import { registerBenefitTools } from "./tools/benefits.js";
import { registerDialectTools } from "./tools/dialect.js";

const server = new McpServer({
  name: "skill60-mcp-server",
  version: "2.1.0",
});

// 全ツール登録
registerNewsTools(server);
registerSubsidyTools(server);
registerPensionTools(server);
registerBenefitTools(server);
registerDialectTools(server);

// stdio
async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SKILL60+ MCP Server v2.1 (LIVE SITE FETCH + DIALECT) running on stdio");
  console.error("9 tools: news, jgrants_search, jgrants_detail, nenkin_news, nenkin_page, senior_sites, scrape_url, dialect_convert, yoshiko_voice");
}

// HTTP（Hostinger VPS用）
async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", name: "skill60-mcp-server", version: "2.1.0", mode: "LIVE_SITE_FETCH+DIALECT", tools: 9 });
  });

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3100");
  app.listen(port, () => {
    console.error(`SKILL60+ MCP Server v2.1 (LIVE+DIALECT) on http://localhost:${port}/mcp`);
  });
}

const mode = process.env.TRANSPORT || "stdio";
if (mode === "http") {
  runHTTP().catch(e => { console.error(e); process.exit(1); });
} else {
  runStdio().catch(e => { console.error(e); process.exit(1); });
}
