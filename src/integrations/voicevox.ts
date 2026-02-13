// SKILL60+ VOICEVOX音声合成連携
// テキストを音声（WAV）に変換

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const VOICEVOX_URL = process.env.VOICEVOX_URL || "http://localhost:50021";
const TIMEOUT = 60000; // 60秒（音声生成は重い）

// === スピーカーID（VOICEVOX） ===

const SPEAKER_IDS: Record<string, number> = {
  "ずんだもん": 3,
  "四国めたん": 2,
  "春日部つむぎ": 8,
  "雨晴はう": 10,
  "波音リツ": 9,
  "玄野武宏": 11,
  "白上虎太郎": 12,
  "青山龍星": 13,
};

// === スキーマ定義 ===

const TextToSpeechSchema = z.object({
  text: z.string().min(1).max(1000)
    .describe("音声化するテキスト"),
  speaker: z.number().min(0).max(100).default(9)
    .describe("スピーカーID（デフォルト: 9 = 波音リツ）"),
  speed: z.number().min(0.5).max(2.0).default(0.9)
    .describe("速度（0.5〜2.0、シニア向けデフォルト: 0.9）"),
}).strict();

// === VOICEVOX API ===

interface AudioQuery {
  accent_phrases: unknown[];
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  outputStereo: boolean;
  kana?: string;
}

async function generateAudioQuery(text: string, speaker: number): Promise<AudioQuery> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const url = `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`;

    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`VOICEVOX audio_query error ${res.status}: ${errText}`);
    }

    return await res.json() as AudioQuery;
  } finally {
    clearTimeout(timer);
  }
}

async function synthesize(query: AudioQuery, speaker: number): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const url = `${VOICEVOX_URL}/synthesis?speaker=${speaker}`;

    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`VOICEVOX synthesis error ${res.status}: ${errText}`);
    }

    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

// === ツール登録 ===

export function registerVoicevoxTools(server: McpServer): void {

  server.registerTool(
    "skill60_text_to_speech",
    {
      title: "テキスト音声化（VOICEVOX）",
      description: `テキストをVOICEVOXで音声（WAV）に変換します。

スピーカーID:
- 3: ずんだもん（親しみやすい）
- 2: 四国めたん（はっきり）
- 8: 春日部つむぎ（落ち着いた女性）
- 9: 波音リツ（デフォルト、自然な女性）

速度: 0.5〜2.0（シニア向けデフォルト: 0.9）

要件: VOICEVOX Engine起動（Docker or ローカル）
環境変数 VOICEVOX_URL（デフォルト: http://localhost:50021）`,
      inputSchema: TextToSpeechSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        // 音声クエリ生成
        const query = await generateAudioQuery(params.text, params.speaker);

        // 速度調整
        query.speedScale = params.speed;

        // 音声合成
        const wavData = await synthesize(query, params.speaker);

        // Base64エンコード（MCP経由で返す場合）
        const base64 = Buffer.from(wavData).toString('base64');

        return {
          content: [{
            type: "text" as const,
            text: `🔊 音声生成完了\n` +
                  `テキスト: ${params.text.slice(0, 50)}${params.text.length > 50 ? "..." : ""}\n` +
                  `スピーカー: ${params.speaker}\n` +
                  `速度: ${params.speed}\n` +
                  `サイズ: ${(wavData.byteLength / 1024).toFixed(1)} KB\n\n` +
                  `Base64 WAVデータ（先頭100文字）:\n${base64.slice(0, 100)}...`,
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ 音声生成エラー: ${e instanceof Error ? e.message : String(e)}\n\n` +
                  `VOICEVOX Engineが起動していることを確認してください:\n` +
                  `docker run -d -p 50021:50021 voicevox/voicevox_engine:latest`,
          }],
        };
      }
    }
  );
}

/**
 * VOICEVOXセットアップガイド（README用）
 */
export const VOICEVOX_SETUP_GUIDE = `
# VOICEVOXセットアップガイド

## 1. VOICEVOX Engine起動（Docker）

### VPSの場合（Hostinger等）
\`\`\`bash
# Docker起動
docker run -d -p 50021:50021 voicevox/voicevox_engine:latest

# 確認
curl http://localhost:50021/speakers
\`\`\`

### ローカルの場合
https://voicevox.hiroshiba.jp/ から VOICEVOX Engineをダウンロード
- 起動後、http://localhost:50021 で自動起動

## 2. 環境変数設定
\`\`\`bash
export VOICEVOX_URL=http://localhost:50021
\`\`\`

## 3. テスト
\`\`\`bash
# スピーカー一覧確認
curl http://localhost:50021/speakers

# 音声生成テスト
curl -X POST "http://localhost:50021/audio_query?text=こんにちは&speaker=9"
\`\`\`

## 4. N8Nワークフロー統合例
\`\`\`
ニュース取得 → ヨシコ変換 → VOICEVOX音声化 → LINE音声メッセージ送信
\`\`\`

## 5. おすすめスピーカー（ヨシコ用）
- **波音リツ (ID: 9)**: 自然な女性の声、デフォルト推奨
- **春日部つむぎ (ID: 8)**: 落ち着いた大人の女性
- **四国めたん (ID: 2)**: はっきりした声

速度: 0.85〜0.95（シニア向けにゆっくり）
`;
