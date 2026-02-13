// SKILL60+ 市場価値・求人検索ツール
// ハローワーク、シルバー人材センター、Indeedから求人情報を取得

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSite } from "../services/fetcher.js";
import { callLLM } from "../services/llm.js";

// === スキーマ定義 ===

const MarketValueSchema = z.object({
  skills: z.array(z.string()).min(1).max(10)
    .describe("スキル・経験のキーワード（例: ['経理', '簿記', 'Excel']）"),
  region: z.string().min(1).max(50).default("全国")
    .describe("地域（例: '東京', '大阪', '福井', '全国'）"),
  age_range: z.string().default("60+")
    .describe("年齢層（例: '60+', '50-65', 'シニア'）"),
}).strict();

const SkillAssessSchema = z.object({
  skill_description: z.string().min(1).max(1000)
    .describe("スキル・経験の詳細説明"),
  years_experience: z.number().min(0).max(60)
    .describe("経験年数"),
  region: z.string().min(1).max(50).default("全国")
    .describe("対象地域"),
}).strict();

// === Indeed RSS検索 ===

async function searchIndeed(keyword: string, region: string): Promise<string> {
  try {
    const query = encodeURIComponent(`シニア ${keyword}`);
    const location = encodeURIComponent(region === "全国" ? "" : region);
    const url = `https://jp.indeed.com/rss?q=${query}&l=${location}`;

    const html = await fetchSite(url);

    // RSS XMLから求人タイトルと会社名を抽出（簡易パース）
    const titleMatches = html.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
    const titles = Array.from(titleMatches).slice(0, 10).map(m => m[1]);

    if (titles.length === 0) {
      return `Indeed: ${keyword}の求人情報が見つかりませんでした。`;
    }

    return `Indeed検索結果（${titles.length}件）:\n` +
           titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
  } catch (e) {
    return `Indeed検索エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// === ハローワーク検索 ===

async function searchHelloWork(keyword: string, region: string): Promise<string> {
  try {
    // ハローワークインターネットサービスは公開APIなし
    // スクレイピングが必要だが、構造が複雑なため簡易実装
    const url = `https://www.hellowork.mhlw.go.jp/`;

    return `ハローワーク: ${keyword}の検索は手動で https://www.hellowork.mhlw.go.jp/ をご確認ください。\n` +
           `検索キーワード: "${keyword}" + "${region}"`;
  } catch (e) {
    return `ハローワーク検索エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// === シルバー人材センター情報 ===

async function searchSilverJinzai(region: string): Promise<string> {
  try {
    const url = "https://www.zsjc.or.jp/";
    const html = await fetchSite(url);

    // サイトから地域情報を抽出（簡易）
    return `全国シルバー人材センター事業協会:\n` +
           `${region}のシルバー人材センターは https://www.zsjc.or.jp/ から検索できます。\n` +
           `主な仕事: 清掃、施設管理、事務補助、保育補助、学習指導など`;
  } catch (e) {
    return `シルバー人材検索エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// === ツール登録 ===

export function registerMarketTools(server: McpServer): void {

  // ── 1. 市場価値・求人検索 ──
  server.registerTool(
    "skill60_market_value",
    {
      title: "市場価値・求人検索（ハロワ/Indeed/シルバー人材）",
      description: `指定したスキル・地域で求人情報を検索します。

情報源:
- Indeed Japan (RSS): シニア向け求人検索
- ハローワークインターネットサービス: 公共職業紹介
- 全国シルバー人材センター: シニア向け短時間・軽作業

検索結果から、そのスキルの市場需要や求人数の傾向を把握できます。`,
      inputSchema: MarketValueSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const keyword = params.skills.join(' ');

        // 並列検索
        const [indeedResult, helloWorkResult, silverResult] = await Promise.all([
          searchIndeed(keyword, params.region),
          searchHelloWork(keyword, params.region),
          searchSilverJinzai(params.region),
        ]);

        const result = `💼 市場価値・求人検索結果\n` +
                      `スキル: ${params.skills.join(', ')}\n` +
                      `地域: ${params.region}\n` +
                      `年齢層: ${params.age_range}\n\n` +
                      `--- Indeed ---\n${indeedResult}\n\n` +
                      `--- ハローワーク ---\n${helloWorkResult}\n\n` +
                      `--- シルバー人材センター ---\n${silverResult}`;

        return {
          content: [{
            type: "text" as const,
            text: result,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ 市場価値検索エラー: ${e instanceof Error ? e.message : String(e)}`,
          }],
        };
      }
    }
  );

  // ── 2. スキル市場評価 ──
  server.registerTool(
    "skill60_skill_assess",
    {
      title: "スキル市場評価（需要度・時給レンジ分析）",
      description: `指定したスキル・経験の市場需要度と想定時給レンジを分析します。

Claude APIを使用して:
- そのスキルの市場需要度（高/中/低）
- 想定される時給レンジ
- 類似する求人職種
- スキルアップの提案

を提供します。

要件: 環境変数 ANTHROPIC_API_KEY`,
      inputSchema: SkillAssessSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        // まずIndeedで需要調査
        const indeedResult = await searchIndeed(params.skill_description, params.region);

        // Claude APIで評価
        const systemPrompt = `あなたは人材市場のアナリストです。

与えられたスキル・経験について、以下の観点で分析してください：
1. 市場需要度（高/中/低）とその理由
2. ${params.region}での想定時給レンジ（60代の場合）
3. 類似する求人職種・ポジション
4. スキルをさらに活かすためのアドバイス

実用的でわかりやすく、60代の方向けに説明してください。`;

        const userText = `【スキル・経験】
${params.skill_description}

【経験年数】${params.years_experience}年
【対象地域】${params.region}

【Indeed検索結果】
${indeedResult}`;

        const analysis = await callLLM(systemPrompt, userText);

        return {
          content: [{
            type: "text" as const,
            text: `📊 スキル市場評価\n\n${analysis}`,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ スキル評価エラー: ${e instanceof Error ? e.message : String(e)}`,
          }],
        };
      }
    }
  );
}
