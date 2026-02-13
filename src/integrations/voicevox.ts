// SKILL60+ VOICEVOX連携（生データのみ、LLMなし）

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logError } from "../services/db.js";

// === スキーマ定義 ===

const VoicevoxSynthesisSchema = z.object({
  text: z.string().min(1).max(500)
    .describe("音声合成するテキスト"),
  speaker: z.number().int().min(0).max(100).default(1)
    .describe("話者ID（デフォルト: 1 = 四国めたん ノーマル）"),
  speedScale: z.number().min(0.5).max(2.0).default(1.0)
    .describe("話速（0.5〜2.0、デフォルト: 1.0）"),
  pitchScale: z.number().min(-0.15).max(0.15).default(0.0)
    .describe("音高（-0.15〜0.15、デフォルト: 0.0）"),
  intonationScale: z.number().min(0.0).max(2.0).default(1.0)
    .describe("抑揚（0.0〜2.0、デフォルト: 1.0）"),
}).strict();

// === VOICEVOX API呼び出し ===

async function synthesizeVoice(
  text: string,
  speaker: number,
  speedScale: number,
  pitchScale: number,
  intonationScale: number
): Promise<{
  success: boolean;
  audioQuery?: unknown;
  error?: string;
}> {
  try {
    const voicevoxUrl = process.env.VOICEVOX_API_URL || "http://localhost:50021";

    // 1. audio_query 生成
    const queryUrl = `${voicevoxUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`;

    // Manual fetch (fetchJson doesn't support POST)
    const response = await fetch(queryUrl, { method: "POST" });

    if (!response.ok) {
      throw new Error(`VOICEVOX API error: ${response.status} ${response.statusText}`);
    }

    const audioQuery = await response.json() as {
      accent_phrases?: unknown[];
      speedScale?: number;
      pitchScale?: number;
      intonationScale?: number;
    };

    // 2. パラメータ調整
    audioQuery.speedScale = speedScale;
    audioQuery.pitchScale = pitchScale;
    audioQuery.intonationScale = intonationScale;

    return {
      success: true,
      audioQuery,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await logError("skill60_text_to_speech", `VOICEVOX音声合成エラー: ${errorMsg}`, { text, speaker });
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// === 話者一覧 ===

const SPEAKER_LIST = [
  { id: 0, name: "四国めたん ノーマル" },
  { id: 1, name: "四国めたん あまあま" },
  { id: 2, name: "四国めたん ツンツン" },
  { id: 3, name: "ずんだもん ノーマル" },
  { id: 4, name: "ずんだもん あまあま" },
  { id: 5, name: "ずんだもん ツンツン" },
  { id: 8, name: "春日部つむぎ ノーマル" },
  { id: 10, name: "雨晴はう ノーマル" },
  { id: 11, name: "波音リツ ノーマル" },
  { id: 13, name: "玄野武宏 ノーマル" },
  { id: 14, name: "白上虎太郎 ノーマル" },
  { id: 16, name: "青山龍星 ノーマル" },
  { id: 20, name: "冥鳴ひまり ノーマル" },
  { id: 21, name: "九州そら ノーマル" },
];

// === ツール登録 ===

export function registerVoicevoxTools(server: McpServer): void {

  server.registerTool(
    "skill60_text_to_speech",
    {
      title: "音声合成（VOICEVOX 生データ）",
      description: `VOICEVOX APIを使用してテキストを音声合成します。

**このツールは生データを返すのみ。LLM処理は行いません。**
LLM側で音声化するテキストを生成し、このツールで合成してください。

話者ID例:
- 0: 四国めたん ノーマル
- 1: 四国めたん あまあま
- 3: ずんだもん ノーマル
- 8: 春日部つむぎ
- 11: 波音リツ
- 13: 玄野武宏（男性）

環境変数:
- VOICEVOX_API_URL: VOICEVOX Engine URL（デフォルト: http://localhost:50021）

※ VOICEVOX Engineが起動している必要があります。`,
      inputSchema: VoicevoxSynthesisSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const result = await synthesizeVoice(
          params.text,
          params.speaker,
          params.speedScale,
          params.pitchScale,
          params.intonationScale
        );

        if (!result.success) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ 音声合成失敗: ${result.error}\n\n` +
                    `【確認事項】\n` +
                    `- VOICEVOX Engineが起動しているか\n` +
                    `- VOICEVOX_API_URLが正しく設定されているか（デフォルト: http://localhost:50021）`,
            }],
          };
        }

        const speakerInfo = SPEAKER_LIST.find(s => s.id === params.speaker);
        const speakerName = speakerInfo?.name || `話者ID ${params.speaker}`;

        let output = `🎤 音声合成完了（生データ）\n\n`;
        output += `【テキスト】\n${params.text}\n\n`;
        output += `【話者】\n${speakerName}\n\n`;
        output += `【パラメータ】\n`;
        output += `- 話速: ${params.speedScale}\n`;
        output += `- 音高: ${params.pitchScale}\n`;
        output += `- 抑揚: ${params.intonationScale}\n\n`;
        output += `【AudioQuery生成済み】\n`;
        output += `次のステップで synthesis を実行してください。\n`;
        output += `（VOICEVOX Engine の /synthesis エンドポイントにPOST）`;

        return {
          content: [{
            type: "text" as const,
            text: output,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_text_to_speech", `全体エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ 音声合成エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );
}
