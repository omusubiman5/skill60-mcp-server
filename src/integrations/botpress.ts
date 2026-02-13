// SKILL60+ Botpress連携（生データのみ、LLMなし）

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logError } from "../services/db.js";

// === スキーマ定義 ===

const BotpressSendSchema = z.object({
  message: z.string().min(1).max(1000)
    .describe("Botpressに送信するメッセージ"),
  userId: z.string().min(1).max(100).default("skill60_user")
    .describe("ユーザーID（デフォルト: skill60_user）"),
  conversationId: z.string().max(100).default("")
    .describe("会話ID（オプション、継続会話時に使用）"),
}).strict();

// === Botpress API呼び出し ===

async function sendToBotpress(message: string, userId: string, conversationId?: string): Promise<{
  success: boolean;
  response?: string;
  conversationId?: string;
  error?: string;
}> {
  try {
    const webhookUrl = process.env.BOTPRESS_WEBHOOK_URL;
    const botId = process.env.BOTPRESS_BOT_ID;

    if (!webhookUrl || !botId) {
      return {
        success: false,
        error: "BOTPRESS_WEBHOOK_URL または BOTPRESS_BOT_ID が設定されていません",
      };
    }

    const payload = {
      type: "text",
      text: message,
      userId,
      ...(conversationId && { conversationId }),
    };

    // Manual fetch (fetchJson doesn't support POST with body)
    const response = await fetch(`${webhookUrl}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-id": botId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Botpress API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as {
      responses?: Array<{ type: string; text?: string }>;
      conversationId?: string;
    };

    const responseText = result.responses?.[0]?.text || "応答なし";

    return {
      success: true,
      response: responseText,
      conversationId: result.conversationId,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    await logError("skill60_botpress_send", `Botpress送信エラー: ${errorMsg}`, { message, userId });
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// === ツール登録 ===

export function registerBotpressTools(server: McpServer): void {

  server.registerTool(
    "skill60_botpress_send",
    {
      title: "Botpress送信（生データ）",
      description: `Botpressチャットボットにメッセージを送信します。

**このツールは生データを返すのみ。LLM処理は行いません。**
LLM側でメッセージを生成し、このツールで送信してください。

環境変数:
- BOTPRESS_WEBHOOK_URL: BotpressのWebhook URL
- BOTPRESS_BOT_ID: ボットID`,
      inputSchema: BotpressSendSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const result = await sendToBotpress(params.message, params.userId, params.conversationId || undefined);

        if (!result.success) {
          return {
            content: [{
              type: "text" as const,
              text: `❌ Botpress送信失敗: ${result.error}`,
            }],
          };
        }

        let output = `💬 Botpress送信完了（生データ）\n\n`;
        output += `【送信】\n${params.message}\n\n`;
        output += `【応答】\n${result.response}\n\n`;
        output += `【会話ID】\n${result.conversationId || "新規会話"}`;

        return {
          content: [{
            type: "text" as const,
            text: output,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_botpress_send", `全体エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ Botpress送信エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );
}
