// SKILL60+ 健康・天気情報ツール
// 厚労省健康情報、気象庁天気予報、シニア向け健康アドバイス

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSite, fetchJson } from "../services/fetcher.js";
import { callClaude } from "../services/claude.js";

// === 地域コード対応表（気象庁） ===

const AREA_CODES: Record<string, string> = {
  "北海道": "016000",
  "青森": "020000",
  "岩手": "030000",
  "宮城": "040000",
  "秋田": "050000",
  "山形": "060000",
  "福島": "070000",
  "茨城": "080000",
  "栃木": "090000",
  "群馬": "100000",
  "埼玉": "110000",
  "千葉": "120000",
  "東京": "130000",
  "神奈川": "140000",
  "新潟": "150000",
  "富山": "160000",
  "石川": "170000",
  "福井": "180000",
  "山梨": "190000",
  "長野": "200000",
  "岐阜": "210000",
  "静岡": "220000",
  "愛知": "230000",
  "三重": "240000",
  "滋賀": "250000",
  "京都": "260000",
  "大阪": "270000",
  "兵庫": "280000",
  "奈良": "290000",
  "和歌山": "300000",
  "鳥取": "310000",
  "島根": "320000",
  "岡山": "330000",
  "広島": "340000",
  "山口": "350000",
  "徳島": "360000",
  "香川": "370000",
  "愛媛": "380000",
  "高知": "390000",
  "福岡": "400000",
  "佐賀": "410000",
  "長崎": "420000",
  "熊本": "430000",
  "大分": "440000",
  "宮崎": "450000",
  "鹿児島": "460000",
  "沖縄": "471000",
};

function getAreaCode(region: string): string {
  // 完全一致
  if (AREA_CODES[region]) return AREA_CODES[region]!;

  // 部分一致（例: "福井県" → "福井"）
  for (const [key, code] of Object.entries(AREA_CODES)) {
    if (region.includes(key) || key.includes(region)) return code;
  }

  // デフォルト: 東京
  return "130000";
}

// === スキーマ定義 ===

const HealthInfoSchema = z.object({
  category: z.enum(["checkup", "exercise", "nutrition", "mental"]).default("checkup")
    .describe("カテゴリ: checkup(健診), exercise(運動), nutrition(栄養), mental(メンタル)"),
  region: z.string().min(1).max(50).default("全国")
    .describe("地域（自治体健診情報用）"),
}).strict();

const WeatherAdviceSchema = z.object({
  region: z.string().min(1).max(50).default("東京")
    .describe("地域名（例: '東京', '福井', '大阪'）"),
}).strict();

// === 厚労省健康情報取得 ===

async function fetchHealthInfo(category: string): Promise<string> {
  try {
    const categoryNames: Record<string, string> = {
      checkup: "健診・検診",
      exercise: "運動・身体活動",
      nutrition: "栄養・食生活",
      mental: "こころの健康",
    };

    // 厚労省健康情報ページ
    const url = "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/kenkou/index.html";
    const html = await fetchSite(url);

    // 簡易的なタイトル抽出（実際のページ構造に応じて調整）
    const titleMatches = html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g);
    const titles = Array.from(titleMatches).slice(0, 5).map(m => m[1]);

    return `厚労省 - ${categoryNames[category as keyof typeof categoryNames]}\n` +
           `最新情報（一部）:\n` +
           (titles.length > 0 ? titles.map((t, i) => `${i + 1}. ${t}`).join('\n') : "情報取得中...") +
           `\n\n詳細: ${url}`;
  } catch (e) {
    return `健康情報取得エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// === 気象庁天気予報取得 ===

interface WeatherData {
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
}

async function fetchWeather(region: string): Promise<string> {
  try {
    const areaCode = getAreaCode(region);
    const url = `https://www.jma.go.jp/bosai/forecast/data/forecast/${areaCode}.json`;

    const data = await fetchJson<WeatherData[]>(url);

    if (!Array.isArray(data) || data.length === 0) {
      return `天気情報が取得できませんでした（地域: ${region}）`;
    }

    const forecast = data[0];
    const timeSeries = forecast?.timeSeries?.[0];
    const area = timeSeries?.areas?.[0];
    const weather = area?.weathers?.[0] || "情報なし";
    const publishTime = forecast?.reportDatetime || "不明";

    return `【${region}の天気】\n` +
           `発表: ${publishTime}\n` +
           `天気: ${weather}`;
  } catch (e) {
    return `天気情報取得エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// === ツール登録 ===

export function registerHealthTools(server: McpServer): void {

  // ── 1. 健康情報取得 ──
  server.registerTool(
    "skill60_health_info",
    {
      title: "健康情報取得（厚労省/e-ヘルスネット）",
      description: `厚生労働省の健康情報を取得します。

カテゴリ:
- checkup: 健診・検診情報
- exercise: 運動・身体活動
- nutrition: 栄養・食生活
- mental: こころの健康

シニア向けの健康維持・増進に役立つ最新情報を提供します。`,
      inputSchema: HealthInfoSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const result = await fetchHealthInfo(params.category);

        return {
          content: [{
            type: "text" as const,
            text: `🏥 健康情報\n\n${result}`,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ 健康情報取得エラー: ${e instanceof Error ? e.message : String(e)}`,
          }],
        };
      }
    }
  );

  // ── 2. 天気ベース健康アドバイス ──
  server.registerTool(
    "skill60_weather_advice",
    {
      title: "天気ベース健康アドバイス（気象庁API + Claude）",
      description: `気象庁の天気予報を取得し、シニア向けの健康アドバイスを生成します。

情報源:
- 気象庁天気予報API（全国対応）
- Claude APIで健康アドバイス生成

出力例:
「今日は最高気温35度の予報です。水分補給をこまめに、外出は涼しい午前中がおすすめです。」

要件: 環境変数 ANTHROPIC_API_KEY`,
      inputSchema: WeatherAdviceSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        // 天気情報取得
        const weatherInfo = await fetchWeather(params.region);

        // Claude APIでアドバイス生成
        const systemPrompt = `あなたはシニア向けの健康アドバイザーです。

天気情報を元に、60代以上の方向けの健康アドバイスを提供してください：
- 気温・天候に応じた注意点
- 外出時の服装アドバイス
- 水分補給や体調管理のポイント
- 適した活動時間帯

温かみのある、わかりやすい言葉で伝えてください。`;

        const advice = await callClaude(systemPrompt, weatherInfo);

        return {
          content: [{
            type: "text" as const,
            text: `🌤️ 天気と健康アドバイス\n\n${weatherInfo}\n\n【アドバイス】\n${advice}`,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ 天気アドバイス取得エラー: ${e instanceof Error ? e.message : String(e)}`,
          }],
        };
      }
    }
  );
}
