// SKILL60+ LLM API 共通サービス（OpenRouter API）
// 方言変換、スキル評価、健康アドバイス等で共有

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const DEFAULT_TIMEOUT = 30000; // 30秒

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * OpenRouter API経由でLLMを呼び出す共通関数
 * @param systemPrompt システムプロンプト（キャラ設定、タスク定義）
 * @param userText ユーザー入力テキスト
 * @param timeout タイムアウト（ms）デフォルト30秒
 * @returns LLM APIのレスポンステキスト
 */
export async function callLLM(
  systemPrompt: string,
  userText: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY が設定されていません。環境変数に設定してください。");
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(OPENROUTER_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/omusubiman5/skill60-mcp-server",
        "X-Title": "SKILL60+ MCP Server",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter API ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    if (data.error) throw new Error(data.error.message);

    return data.choices?.[0]?.message?.content || "結果を取得できませんでした。";
  } finally {
    clearTimeout(timer);
  }
}
