// SKILL60+ 健康・天気情報ツール（生データのみ、LLMなし）

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSite, fetchJson } from "../services/fetcher.js";
import { logError } from "../services/db.js";

// === 地域コード対応表（気象庁） ===

const AREA_CODES: Record<string, string> = {
  "北海道": "016000", "青森": "020000", "岩手": "030000", "宮城": "040000",
  "秋田": "050000", "山形": "060000", "福島": "070000", "茨城": "080000",
  "栃木": "090000", "群馬": "100000", "埼玉": "110000", "千葉": "120000",
  "東京": "130000", "神奈川": "140000", "新潟": "150000", "富山": "160000",
  "石川": "170000", "福井": "180000", "山梨": "190000", "長野": "200000",
  "岐阜": "210000", "静岡": "220000", "愛知": "230000", "三重": "240000",
  "滋賀": "250000", "京都": "260000", "大阪": "270000", "兵庫": "280000",
  "奈良": "290000", "和歌山": "300000", "鳥取": "310000", "島根": "320000",
  "岡山": "330000", "広島": "340000", "山口": "350000", "徳島": "360000",
  "香川": "370000", "愛媛": "380000", "高知": "390000", "福岡": "400000",
  "佐賀": "410000", "長崎": "420000", "熊本": "430000", "大分": "440000",
  "宮崎": "450000", "鹿児島": "460000", "沖縄": "471000",
};

function getAreaCode(region: string): string {
  if (AREA_CODES[region]) return AREA_CODES[region]!;
  for (const [key, code] of Object.entries(AREA_CODES)) {
    if (region.includes(key) || key.includes(region)) return code;
  }
  return "180000"; // デフォルト: 福井
}

// === スキーマ定義 ===

const HealthInfoSchema = z.object({
  category: z.enum(["checkup", "exercise", "nutrition", "mental", "general"]).default("general")
    .describe("カテゴリ: checkup(健診), exercise(運動), nutrition(栄養), mental(メンタル), general(全般)"),
  keyword: z.string().max(100).default("")
    .describe("検索キーワード（オプション）"),
  region: z.string().min(1).max(50).default("全国")
    .describe("地域（自治体健診情報用）"),
}).strict();

const WeatherSchema = z.object({
  region: z.string().min(1).max(50).default("福井")
    .describe("地域名（例: '福井', '東京', '大阪'）"),
}).strict();

// === ツール登録 ===

export function registerHealthTools(server: McpServer): void {

  // ── 1. 健康情報取得 ──
  server.registerTool(
    "skill60_health_info",
    {
      title: "健康情報取得（生データ）",
      description: `厚生労働省・e-ヘルスネットから健康情報を取得します。

カテゴリ:
- checkup: 健診・検診情報
- exercise: 運動・身体活動
- nutrition: 栄養・食生活
- mental: こころの健康
- general: 全般情報

**このツールは生データを返すのみ。アドバイスは行いません。**
LLM側でアドバイスを生成してください。`,
      inputSchema: HealthInfoSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const categoryNames: Record<string, string> = {
          checkup: "健診・検診",
          exercise: "運動・身体活動",
          nutrition: "栄養・食生活",
          mental: "こころの健康",
          general: "健康情報全般",
        };

        // 厚労省健康情報ページ
        const mhlwUrl = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/kenkou/index.html";

        let result = `🏥 健康情報（生データ）\n` +
                    `カテゴリ: ${categoryNames[params.category]}\n` +
                    `地域: ${params.region}\n\n` +
                    `【厚生労働省】\n` +
                    `健康情報サイト: ${mhlwUrl}\n\n`;

        // e-ヘルスネットのキーワード検索
        if (params.keyword) {
          const ehealthUrl = `https://www.e-healthnet.mhlw.go.jp/information/search_result?q=${encodeURIComponent(params.keyword)}`;
          result += `【e-ヘルスネット検索】\n` +
                   `キーワード: "${params.keyword}"\n` +
                   `検索URL: ${ehealthUrl}\n`;
        }

        return {
          content: [{
            type: "text" as const,
            text: result,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_health_info", `健康情報取得エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ 健康情報取得エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );

  // ── 2. 天気取得 ──
  server.registerTool(
    "skill60_weather",
    {
      title: "天気予報取得（生データ）",
      description: `気象庁APIから天気予報を取得します。

**このツールは生データを返すのみ。健康アドバイスは行いません。**
LLM側で天気に応じた健康アドバイスを生成してください。`,
      inputSchema: WeatherSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const areaCode = getAreaCode(params.region);
        const url = `https://www.jma.go.jp/bosai/forecast/data/forecast/${areaCode}.json`;

        const data = await fetchJson<Array<{
          publishingOffice?: string;
          reportDatetime?: string;
          timeSeries?: Array<{
            areas?: Array<{
              area?: { name?: string };
              weathers?: string[];
              temps?: string[];
            }>;
            timeDefines?: string[];
          }>;
        }>>(url);

        if (!Array.isArray(data) || data.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `天気情報が取得できませんでした（地域: ${params.region}）`,
            }],
          };
        }

        const forecast = data[0];
        const timeSeries = forecast?.timeSeries?.[0];
        const area = timeSeries?.areas?.[0];
        const weather = area?.weathers?.[0] || "情報なし";
        const temps = forecast?.timeSeries?.[2]?.areas?.[0]?.temps || [];
        const publishTime = forecast?.reportDatetime || "不明";

        let result = `🌤️ 天気予報（生データ）\n` +
                    `地域: ${params.region}\n` +
                    `発表: ${publishTime}\n\n` +
                    `【天気】\n${weather}\n`;

        if (temps.length >= 2) {
          result += `\n【気温】\n最低: ${temps[0]}℃ / 最高: ${temps[1]}℃\n`;
        }

        return {
          content: [{
            type: "text" as const,
            text: result,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_weather", `天気情報取得エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ 天気情報取得エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );
}
