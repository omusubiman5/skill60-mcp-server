// SKILL60+ Claude API 共通サービス
// 方言変換、スキル評価、健康アドバイス等で共有

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const DEFAULT_TIMEOUT = 30000; // 30秒

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  error?: { message: string };
}

/**
 * Claude APIを呼び出す共通関数
 * @param systemPrompt システムプロンプト（キャラ設定、タスク定義）
 * @param userText ユーザー入力テキスト
 * @param timeout タイムアウト（ms）デフォルト30秒
 * @returns Claude APIのレスポンステキスト
 */
export async function callClaude(
  systemPrompt: string,
  userText: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。環境変数に設定してください。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

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
      .join("") || "結果を取得できませんでした。";
  } finally {
    clearTimeout(timer);
  }
}
