// SKILL60+ 方言変換 - Claude APIで自然な方言に変換
// 辞書ベース（語尾だけ）ではなく、LLMの言語力で語彙・表現まで含めた本物の方言を生成

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// 地域別ヒント（プロンプト補強用）
const DIALECT_HINTS: Record<string, string> = {
  "福井": "「〜やざ」「〜のぉ」「ほやほや」「つるつるいっぱい」「おちょきん」など福井弁（嶺北方言ベース）を適度に使う。",
  "大阪": "「〜やねん」「〜やで」「ほんま」「めっちゃ」「あかん」「なんでやねん」など大阪弁を使う。",
  "京都": "「〜どす」「〜え」「おおきに」「はんなり」など京都弁のはんなりした表現を使う。",
  "博多": "「〜ばい」「〜たい」「〜っちゃ」「よかよか」「せからしか」など博多弁を使う。",
  "広島": "「〜じゃけん」「〜じゃろ」「ぶち」「たいぎぃ」など広島弁を使う。",
  "名古屋": "「〜だがや」「〜みゃー」「でら」「えりゃー」など名古屋弁を使う。",
  "東北": "「〜だべ」「〜だっちゃ」「んだ」「おばんです」など東北弁を使う。",
  "沖縄": "「〜さー」「〜やー」「なんくるないさ」「めんそーれ」など沖縄方言を適度に使う。",
  "北海道": "「〜っしょ」「なまら」「したっけ」「こわい（疲れた）」など北海道弁を使う。",
  "秋田": "「〜だす」「〜んだ」「なんぼ」「けやぐ」など秋田弁を使う。",
  "津軽": "「〜だべ」「〜だはんで」「わ（私）」「け（食べろ）」など津軽弁を使う。",
  "鹿児島": "「〜でごわす」「〜じゃっど」「よかにせ」「おやっとさぁ」など薩摩弁を使う。",
  "石川": "「〜がいね」「〜げん」「あんやと」「きのどくな」など金沢弁を使う。",
  "富山": "「〜ちゃ」「〜がやちゃ」「きときと」など富山弁を使う。",
};

function getHint(region: string): string {
  if (DIALECT_HINTS[region]) return DIALECT_HINTS[region]!;
  for (const [key, hint] of Object.entries(DIALECT_HINTS)) {
    if (region.includes(key) || key.includes(region)) return hint;
  }
  return `${region}の方言の特徴的な語彙・語尾・表現を適度に使う。`;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  error?: { message: string };
}

async function callClaude(systemPrompt: string, userText: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。環境変数に設定してください。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    if (data.error) throw new Error(data.error.message);

    return data.content
      ?.filter(c => c.type === "text")
      .map(c => c.text ?? "")
      .join("") || "変換結果を取得できませんでした。";
  } finally {
    clearTimeout(timer);
  }
}

// === スキーマ定義 ===

const ConvertSchema = z.object({
  text: z.string().min(1).max(5000)
    .describe("方言に変換するテキスト（標準語）"),
  region: z.string().min(1).max(50).default("福井")
    .describe("方言の地域（例: '福井', '大阪', '博多', '広島', '沖縄', '秋田'）"),
  tone: z.enum(["friendly", "gentle", "energetic", "elderly"]).default("friendly")
    .describe("口調: friendly(親しみやすい), gentle(穏やか), energetic(元気), elderly(年配の方風)"),
  strength: z.enum(["light", "medium", "strong"]).default("medium")
    .describe("方言の濃さ: light(ほんのり), medium(自然), strong(ガッツリ)"),
}).strict();

const YoshikoSchema = z.object({
  text: z.string().min(1).max(5000)
    .describe("ヨシコの口調に変換するテキスト"),
  region: z.string().min(1).max(50).default("福井")
    .describe("ヨシコの出身地域"),
}).strict();

// === ツール登録 ===

export function registerDialectTools(server: McpServer): void {

  // ── 1. 汎用方言変換 ──
  server.registerTool(
    "skill60_dialect_convert",
    {
      title: "方言変換（Claude API / 全国対応）",
      description: `標準語のテキストを指定した地域の方言に変換します。
Claude APIを使い、語尾だけでなく語彙・表現まで含めた自然な方言を生成。

対応地域例: 福井, 大阪, 京都, 博多, 広島, 名古屋, 東北, 沖縄, 北海道, 秋田, 津軽, 鹿児島, 石川, 富山 …他も指定可
口調: friendly / gentle / energetic / elderly
濃さ: light / medium / strong

要件: 環境変数 ANTHROPIC_API_KEY`,
      inputSchema: ConvertSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const hint = getHint(params.region);

        const strengthNote: Record<string, string> = {
          light: "方言は控えめに。標準語ベースで、ときどき方言が顔を出す程度。",
          medium: "自然な方言レベル。地元の人同士の日常会話くらいの濃さ。",
          strong: "かなり濃い方言。地元のおばあちゃんが話すくらいの本格的な方言。",
        };

        const toneLabel: Record<string, string> = {
          friendly: "親しみやすい友人のような",
          gentle: "穏やかで優しい",
          energetic: "元気で明るい",
          elderly: "人生経験豊かな年配の方のような",
        };

        const system = `あなたは${params.region}出身の${toneLabel[params.tone]}話し方をする人です。

以下のルールで標準語を${params.region}の方言に変換してください：
1. 語尾だけでなく、その地域特有の語彙・表現・言い回しも使う
2. 元の文章の意味・情報は一切変えない
3. 温かみのある口調にする
4. 方言変換後のテキストだけを返す（説明・注釈は不要）

${hint}
${strengthNote[params.strength]}`;

        const result = await callClaude(system, params.text);

        return {
          content: [{
            type: "text" as const,
            text: `🗣️ ${params.region}弁変換（${params.strength}）\n\n` +
              `【元】${params.text.slice(0, 200)}${params.text.length > 200 ? "..." : ""}\n\n` +
              `【${params.region}弁】${result}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `❌ 方言変換エラー: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );

  // ── 2. ヨシコの声（SKILL60+ AI友人キャラクター） ──
  server.registerTool(
    "skill60_yoshiko_voice",
    {
      title: "ヨシコの声（AI友人キャラクター方言変換）",
      description: `SKILL60+のAI友人「ヨシコ」の口調にテキストを変換します。

ヨシコ = 60代女性、地元の友人ポジション
- 温かく、おせっかいだけど押し付けがましくない
- 地元の方言を自然に使う
- 難しい制度を噎み砕いて伝える
- 「こんなんあったんやけど、知っとる？」と教えてくれる

冷たい行政情報 → 温かい友人のアドバイスに変換。

要件: 環境変数 ANTHROPIC_API_KEY`,
      inputSchema: YoshikoSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const hint = getHint(params.region);

        const system = `あなたは「ヨシコ」という名前の60代女性です。${params.region}出身で地元在住。

キャラクター:
- 温かく親しみやすい、近所のおばちゃん的存在
- おせっかいだけど押し付けがましくない
- 「あんた」「〇〇さん」と相手を呼ぶ
- 難しい制度・手続きを噎み砕いてわかりやすく伝える
- 「こんなんあったんやけど」「知っとった？」と切り出す
- 相手の体調や家族のことも気にかける一言を添える
- 方言は自然に使う（読めない程ではない）

${hint}

以下のテキスト（情報・通知文）を、ヨシコが友人に話しかける口調に変換してください。
情報の正確さは保ちつつ、温かみのある伝え方に。
ヨシコの発言だけを返してください（説明不要）。`;

        const result = await callClaude(system, params.text);

        return {
          content: [{
            type: "text" as const,
            text: `👩 ヨシコ（${params.region}）:\n\n${result}`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `❌ ヨシコ変換エラー: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );
}
