// SKILL60+ 市場価値・求人検索ツール（求人ボックスAPI）

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "../services/fetcher.js";
import { logError } from "../services/db.js";

// === スキーマ定義 ===

const JobSearchSchema = z.object({
  skills: z.array(z.string().min(1).max(50)).min(1).max(5)
    .describe("スキル・経験のキーワード（例: ['経理', '簿記', 'Excel']、1-5件）"),
  region: z.string().min(1).max(50).default("福井")
    .describe("地域（例: '福井', '東京', '大阪', '全国'）"),
  limit: z.number().int().min(1).max(20).default(10)
    .describe("取得件数（1-20）"),
}).strict();

// === 求人ボックス API レスポンス型 ===

interface KyujinBoxJob {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  url?: string;
  description?: string;
}

interface KyujinBoxResponse {
  jobs?: KyujinBoxJob[];
  total?: number;
}

// === ツール登録 ===

export function registerMarketTools(server: McpServer): void {

  server.registerTool(
    "skill60_job_search",
    {
      title: "求人検索（求人ボックスAPI）",
      description: `求人ボックスAPIを使用して求人情報を検索します。

情報源: 求人ボックス（https://kyujinbox.com/）
- シニア・ミドル向け求人を含む日本最大級の求人情報サイト
- 環境変数 KYUJIN_BOX_API_KEY が未設定の場合は検索URLを返します

**このツールは生データを返すのみ。分析・アドバイスは行いません。**
LLM側で分析・アドバイスを生成してください。`,
      inputSchema: JobSearchSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      const apiKey = process.env.KYUJIN_BOX_API_KEY;
      const keyword = params.skills.join(" ");
      const searchUrl = `https://kyujinbox.com/search/?q=${encodeURIComponent(keyword)}&l=${encodeURIComponent(params.region === "全国" ? "" : params.region)}`;

      // APIキー未設定の場合はgraceful degradation
      if (!apiKey) {
        return {
          content: [{
            type: "text" as const,
            text: `💼 求人検索（求人ボックス）\n` +
              `スキル: ${keyword}\n` +
              `地域: ${params.region}\n\n` +
              `⚠️ KYUJIN_BOX_API_KEY が未設定です。求人ボックスで直接検索してください:\n` +
              `🔗 ${searchUrl}\n\n` +
              `【関連情報源】\n` +
              `- ハローワークインターネットサービス: https://www.hellowork.mhlw.go.jp/\n` +
              `- 全国シルバー人材センター: https://www.zsjc.or.jp/`,
          }],
        };
      }

      try {
        const url = `https://api.kyujinbox.com/v1/search?keyword=${encodeURIComponent(keyword)}&location=${encodeURIComponent(params.region === "全国" ? "" : params.region)}&limit=${params.limit}`;

        let data: KyujinBoxResponse;
        try {
          data = await fetchJson<KyujinBoxResponse>(url);
        } catch (fetchErr) {
          const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          await logError("skill60_job_search", `求人ボックスAPI 利用不可: ${fetchMsg}`, params);
          return {
            content: [{
              type: "text" as const,
              text: `⚠️ 求人ボックスAPI は現在利用できません（${fetchMsg}）\n\n` +
                `直接検索はこちら:\n` +
                `🔗 ${searchUrl}`,
            }],
          };
        }

        const jobs = data.jobs ?? [];
        const total = data.total ?? jobs.length;

        if (jobs.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `💼 求人検索結果\n` +
                `スキル: ${keyword} / 地域: ${params.region}\n\n` +
                `検索結果が0件でした。別のキーワードをお試しください。\n` +
                `🔗 直接検索: ${searchUrl}`,
            }],
          };
        }

        const text = jobs.map((j, i) => {
          const lines = [`${i + 1}. ${j.title ?? "タイトル不明"}`];
          if (j.company) lines.push(`   会社: ${j.company}`);
          if (j.location) lines.push(`   勤務地: ${j.location}`);
          if (j.salary) lines.push(`   給与: ${j.salary}`);
          if (j.url) lines.push(`   🔗 ${j.url}`);
          return lines.join("\n");
        }).join("\n\n");

        return {
          content: [{
            type: "text" as const,
            text: `💼 求人検索結果（求人ボックスAPI）\n` +
              `スキル: ${keyword} / 地域: ${params.region}\n` +
              `${total}件中${jobs.length}件表示\n\n` +
              text,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_job_search", `全体エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ 求人検索エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );
}
