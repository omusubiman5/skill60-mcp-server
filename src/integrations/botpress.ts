// SKILL60+ Botpress連携
// BotpressからMCPツールを呼び出すHTTPブリッジ

import type { Request, Response } from "express";

/**
 * Botpress Webhook リクエスト型
 */
interface BotpressRequest {
  intent: string;        // インテント名（greet, ask_news, find_jobs等）
  params: Record<string, unknown>; // パラメータ
  userId: string;        // ユーザーID
  conversationId: string; // 会話ID
}

/**
 * MCPツールマッピング
 * Botpressのインテント → MCPツール名
 */
const INTENT_TO_TOOL: Record<string, string> = {
  "greet": "skill60_yoshiko_voice",
  "ask_news": "skill60_fetch_news",
  "ask_pension": "skill60_nenkin_news",
  "find_grants": "skill60_search_jgrants",
  "find_jobs": "skill60_market_value",
  "health_check": "skill60_health_info",
  "weather": "skill60_weather_advice",
  "dialect": "skill60_dialect_convert",
};

/**
 * Botpress Webhookハンドラー
 * POST /bot で受け取り、MCPツールを実行して結果を返す
 */
export async function handleBotpressWebhook(
  req: Request,
  res: Response,
  mcpTools: Map<string, (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>>
): Promise<void> {
  try {
    const body = req.body as BotpressRequest;

    // Webhook署名検証（オプション）
    const webhookSecret = process.env.BOTPRESS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-botpress-signature'] as string;
      if (!signature || signature !== webhookSecret) {
        res.status(401).json({ error: "Unauthorized: Invalid webhook signature" });
        return;
      }
    }

    // インテント → MCPツール名にマッピング
    const toolName = INTENT_TO_TOOL[body.intent];
    if (!toolName) {
      res.status(400).json({
        error: `Unknown intent: ${body.intent}`,
        supportedIntents: Object.keys(INTENT_TO_TOOL),
      });
      return;
    }

    // MCPツール実行
    const tool = mcpTools.get(toolName);
    if (!tool) {
      res.status(404).json({ error: `Tool not found: ${toolName}` });
      return;
    }

    const result = await tool(body.params);

    // Botpress形式でレスポンス
    res.status(200).json({
      userId: body.userId,
      conversationId: body.conversationId,
      response: result.content
        .filter(c => c.type === "text")
        .map(c => c.text ?? "")
        .join("\n"),
    });
  } catch (e) {
    console.error("[Botpress] Webhook error:", e);
    res.status(500).json({
      error: "Internal server error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Botpressセットアップガイド（README用）
 */
export const BOTPRESS_SETUP_GUIDE = `
# Botpress連携セットアップガイド

## 1. Botpress Cloudアカウント作成
https://botpress.com/ でアカウント作成（無料枠あり）

## 2. Botpressでボット作成
- 新しいBotを作成
- LINE/Web Chatチャンネルを追加

## 3. インテント定義
以下のインテントを作成：

| インテント名 | 説明 | パラメータ例 |
|-------------|------|-------------|
| greet | 挨拶 | { text: "こんにちは", region: "福井" } |
| ask_news | ニュース取得 | { keyword: "年金", limit: 5 } |
| ask_pension | 年金情報 | {} |
| find_grants | 助成金検索 | { keyword: "創業", limit: 10 } |
| find_jobs | 求人検索 | { skills: ["経理"], region: "東京" } |
| health_check | 健康情報 | { category: "checkup" } |
| weather | 天気アドバイス | { region: "福井" } |
| dialect | 方言変換 | { text: "こんにちは", region: "大阪" } |

## 4. Webhook設定
Botpressの Settings → Webhooks で以下を設定：
- URL: https://{VPS_IP}:3100/bot
- Method: POST
- Headers: x-botpress-signature: {BOTPRESS_WEBHOOK_SECRET}

## 5. 環境変数設定
\`\`\`bash
export BOTPRESS_WEBHOOK_SECRET="your-secret-key"
export PORT=3100
export TRANSPORT=http
\`\`\`

## 6. LINE連携（オプション）
Botpress Cloud で LINE Messaging API を連携
- LINE Developers で Messaging API チャンネル作成
- Channel Secret / Access Token を Botpress に設定

## 7. テスト
\`\`\`bash
curl -X POST http://localhost:3100/bot \\
  -H "Content-Type: application/json" \\
  -H "x-botpress-signature: your-secret-key" \\
  -d '{
    "intent": "greet",
    "params": { "text": "はじめまして", "region": "福井" },
    "userId": "test-user",
    "conversationId": "test-conv"
  }'
\`\`\`
`;
