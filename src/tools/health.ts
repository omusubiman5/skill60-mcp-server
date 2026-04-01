// SKILL60+ 健康・天気情報ツール（e-Stat API + 気象庁API）

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "../services/fetcher.js";
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

// === e-Stat 統計ID対応表 ===
// カテゴリごとの代表的な統計調査ID（国民健康・栄養調査等）
const ESTAT_STATS_IDS: Record<string, { statsDataId: string; label: string }> = {
  checkup: { statsDataId: "0003224281", label: "特定健康診査・特定保健指導の実施状況" },
  exercise: { statsDataId: "0003224287", label: "運動習慣に関する統計" },
  nutrition: { statsDataId: "0003224278", label: "栄養・食事に関する統計" },
  general:   { statsDataId: "0003224277", label: "国民健康・栄養調査" },
};

// === e-Stat APIレスポンス型（簡略）===

interface EStatResponse {
  GET_STATS_DATA?: {
    RESULT?: { STATUS?: number; ERROR_MSG?: string };
    PARAMETER?: { TABLE_INF?: { STATISTICS_NAME?: string; TITLE?: string } };
    STATISTICAL_DATA?: {
      TABLE_INF?: { STATISTICS_NAME?: string; TITLE?: string };
      DATA_INF?: {
        NOTE?: Array<{ $: string; "@char"?: string }> | { $: string };
        VALUE?: Array<{ $?: string; "@cat01"?: string; "@area"?: string; "@time"?: string }>;
      };
    };
  };
}

// === スキーマ定義 ===

const HealthStatsSchema = z.object({
  category: z.enum(["checkup", "exercise", "nutrition", "general"]).default("general")
    .describe("カテゴリ: checkup(健診), exercise(運動), nutrition(栄養), general(全般)"),
  keyword: z.string().max(100).default("")
    .describe("検索キーワード（オプション）"),
}).strict();

const WeatherSchema = z.object({
  region: z.string().min(1).max(50).default("福井")
    .describe("地域名（例: '福井', '東京', '大阪'）"),
}).strict();

// === ツール登録 ===

export function registerHealthTools(server: McpServer): void {

  // ── 1. 健康統計取得（e-Stat API） ──
  server.registerTool(
    "skill60_health_stats",
    {
      title: "健康統計取得（e-Stat API）",
      description: `e-Stat（政府統計の総合窓口）APIから健康関連統計データを取得します。

カテゴリ:
- checkup: 特定健診・特定保健指導の実施状況
- exercise: 運動習慣に関する統計
- nutrition: 栄養・食事に関する統計
- general: 国民健康・栄養調査（全般）

環境変数 ESTAT_APP_ID が必要です。未設定の場合はe-Statの検索URLを返します。

**このツールは生データを返すのみ。アドバイスは行いません。**
LLM側でアドバイスを生成してください。`,
      inputSchema: HealthStatsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      const appId = process.env.ESTAT_APP_ID;
      const statsInfo = ESTAT_STATS_IDS[params.category] ?? ESTAT_STATS_IDS["general"]!;
      const keywordQuery = params.keyword ? `&searchWord=${encodeURIComponent(params.keyword)}` : "";
      const directUrl = `https://www.e-stat.go.jp/stat-search/files?page=1&query=${encodeURIComponent(statsInfo.label + (params.keyword ? " " + params.keyword : ""))}`;

      // APIキー未設定の場合はgraceful degradation
      if (!appId) {
        return {
          content: [{
            type: "text" as const,
            text: `🏥 健康統計情報（e-Stat）\n` +
              `カテゴリ: ${statsInfo.label}\n\n` +
              `⚠️ ESTAT_APP_ID が未設定です。e-Statで直接検索してください:\n` +
              `🔗 ${directUrl}\n\n` +
              `【e-Stat 関連統計】\n` +
              `- 国民健康・栄養調査: https://www.e-stat.go.jp/stat-search?page=1&query=%E5%9B%BD%E6%B0%91%E5%81%A5%E5%BA%B7%E6%A0%84%E9%A4%8A%E8%AA%BF%E6%9F%BB\n` +
              `- 特定健診: https://www.e-stat.go.jp/stat-search?page=1&query=%E7%89%B9%E5%AE%9A%E5%81%A5%E5%BA%B7%E8%A8%BA%E6%9F%BB`,
          }],
        };
      }

      try {
        const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${encodeURIComponent(appId)}&statsDataId=${statsInfo.statsDataId}&limit=10${keywordQuery}`;

        let data: EStatResponse;
        try {
          data = await fetchJson<EStatResponse>(url);
        } catch (fetchErr) {
          const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          await logError("skill60_health_stats", `e-Stat API 利用不可: ${fetchMsg}`, params);
          return {
            content: [{
              type: "text" as const,
              text: `⚠️ e-Stat API は現在利用できません（${fetchMsg}）\n\n` +
                `直接検索はこちら:\n` +
                `🔗 ${directUrl}`,
            }],
          };
        }

        const result = data.GET_STATS_DATA?.RESULT;
        if (result?.STATUS !== 0) {
          const errMsg = result?.ERROR_MSG ?? "不明なエラー";
          await logError("skill60_health_stats", `e-Stat APIエラー: ${errMsg}`, params);
          return {
            content: [{
              type: "text" as const,
              text: `⚠️ e-Stat API エラー: ${errMsg}\n\n直接検索: 🔗 ${directUrl}`,
            }],
          };
        }

        const tableInf = data.GET_STATS_DATA?.STATISTICAL_DATA?.TABLE_INF;
        const statsName = tableInf?.STATISTICS_NAME ?? statsInfo.label;
        const title = tableInf?.TITLE ?? "";
        const values = data.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE ?? [];
        const valueArray = Array.isArray(values) ? values : [values];

        const sampleValues = valueArray.slice(0, 5).map(v =>
          `  値: ${v.$ ?? "N/A"}（時点: ${v["@time"] ?? "不明"}, 地域: ${v["@area"] ?? "全国"}）`
        ).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: `🏥 健康統計（e-Stat API）\n` +
              `統計名: ${statsName}\n` +
              `${title ? `タイトル: ${title}\n` : ""}` +
              `カテゴリ: ${statsInfo.label}\n\n` +
              `【データサンプル（最大5件）】\n` +
              (sampleValues || "データなし") + "\n\n" +
              `🔗 詳細: ${directUrl}`,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_health_stats", `全体エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ 健康統計取得エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );

  // ── 2. 天気取得（気象庁API、変更なし） ──
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
