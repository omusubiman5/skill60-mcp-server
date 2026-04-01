// SKILL60+ 市場価値・求人検索ツール（生データのみ、LLMなし）

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// fetchSite は Indeed RSS 廃止により不要となった（2025年以降）
import { logError } from "../services/db.js";

// === スキーマ定義 ===

const MarketValueSchema = z.object({
  skills: z.array(z.string()).min(1).max(5)
    .describe("スキル・経験のキーワード（例: ['経理', '簿記', 'Excel']、1-5件）"),
  region: z.string().min(1).max(50).default("福井")
    .describe("地域（例: '福井', '東京', '大阪', '全国'）"),
}).strict();

// === Indeed RSS検索 ===

async function searchIndeed(keyword: string, region: string): Promise<string> {
  // Indeed Japan は RSS フィードを廃止済み（2025年以降 404/403 を返す）
  // graceful degradation: 公式求人検索ページへの誘導を返す
  const query = encodeURIComponent(`シニア ${keyword}`);
  const location = encodeURIComponent(region === "全国" ? "" : region);
  const searchUrl = `https://jp.indeed.com/jobs?q=${query}&l=${location}&sort=date`;

  return `【Indeed求人検索】\n` +
         `"シニア ${keyword}"（${region}）の求人は以下のサイトで検索できます:\n` +
         `${searchUrl}\n` +
         `※ Indeed RSS フィードは廃止されました。直接サイトでご確認ください。`;
}

// === ハローワーク情報 ===

async function getHelloWorkInfo(keyword: string, region: string): Promise<string> {
  try {
    const url = "https://www.hellowork.mhlw.go.jp/";
    return `【ハローワークインターネットサービス】\n` +
           `"${keyword}"の求人は以下のサイトで検索できます：\n` +
           `${url}\n` +
           `検索キーワード: "${keyword}" + "${region}"`;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await logError("skill60_market_value", `ハローワーク情報取得エラー: ${errorMsg}`, { keyword, region });
    return `ハローワーク情報取得エラー: ${errorMsg}`;
  }
}

// === シルバー人材センター情報 ===

async function getSilverJinzaiInfo(region: string): Promise<string> {
  try {
    const url = "https://www.zsjc.or.jp/";
    return `【全国シルバー人材センター事業協会】\n` +
           `"${region}"のシルバー人材センターは以下のサイトで検索できます：\n` +
           `${url}\n` +
           `主な仕事: 清掃、施設管理、事務補助、保育補助、学習指導、軽作業など`;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await logError("skill60_market_value", `シルバー人材情報取得エラー: ${errorMsg}`, { region });
    return `シルバー人材情報取得エラー: ${errorMsg}`;
  }
}

// === ツール登録 ===

export function registerMarketTools(server: McpServer): void {

  server.registerTool(
    "skill60_market_value",
    {
      title: "市場価値・求人検索（生データ）",
      description: `指定したスキル・地域で求人情報を検索します。

情報源:
- Indeed Japan: シニア向け求人検索ページのURLを返す（RSS廃止済み）
- ハローワークインターネットサービス: 公共職業紹介サイトURL
- 全国シルバー人材センター: シニア向け短時間・軽作業の情報

**このツールは生データを返すのみ。分析・アドバイスは行いません。**
LLM側で分析・アドバイスを生成してください。`,
      inputSchema: MarketValueSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const keywords = params.skills.join(', ');

        // 並列検索
        const results = await Promise.all(
          params.skills.map((skill) => searchIndeed(skill, params.region))
        );

        const helloWorkInfo = await getHelloWorkInfo(keywords, params.region);
        const silverInfo = await getSilverJinzaiInfo(params.region);

        const output = `💼 市場価値・求人検索結果（生データ）\n` +
                      `スキル: ${keywords}\n` +
                      `地域: ${params.region}\n\n` +
                      `${results.join('\n\n')}\n\n` +
                      `${helloWorkInfo}\n\n` +
                      `${silverInfo}`;

        return {
          content: [{
            type: "text" as const,
            text: output,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_market_value", `全体エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ 市場価値検索エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );
}
