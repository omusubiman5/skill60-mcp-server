# SKILL60+ MCP Server v3.0 — Full Integration (OpenRouter API)

シニア（60歳以上）の生活をバックアップする統合MCPサーバー。

**v3.0新機能**: 市場価値検索 + 健康情報 + Botpress連携 + VOICEVOX音声合成 + **OpenRouter API対応**

**OpenRouter API**: 複数のLLMプロバイダーを統合。モデルを環境変数で簡単に切り替え可能。

AI友人ヨシコの「知識の引き出し」と「声」。田中さんが半日かけて調べることを、朝のLINE1通で解決する。

## 14のツール

### 基本情報取得（v2.1までのツール）

| ツール | 情報源 | 方式 |
|--------|--------|------|
| `skill60_fetch_news` | NHK / Yahoo!ニュース | RSS |
| `skill60_search_jgrants` | jGrants | API |
| `skill60_jgrants_detail` | jGrants | API |
| `skill60_nenkin_news` | 日本年金機構 | スクレイピング |
| `skill60_nenkin_page` | 日本年金機構 | スクレイピング |
| `skill60_fetch_senior_sites` | JR/JAL/ANA | スクレイピング |
| `skill60_scrape_url` | 任意URL | 汎用スクレイパー |
| `skill60_dialect_convert` | Claude API | 方言変換 |
| `skill60_yoshiko_voice` | Claude API | ヨシコの声 |

### v3.0 新ツール

| ツール | 機能 | 情報源 |
|--------|------|--------|
| `skill60_market_value` | 市場価値・求人検索 | Indeed / ハロワ / シルバー人材 |
| `skill60_skill_assess` | スキル市場評価 | Claude API + 求人データ |
| `skill60_health_info` | 健康情報取得 | 厚労省 / e-ヘルスネット |
| `skill60_weather_advice` | 天気ベース健康アドバイス | 気象庁 API + Claude API |
| `skill60_text_to_speech` | テキスト音声化 | VOICEVOX Engine |

## セットアップ

```bash
npm install
npm run build
```

## 環境変数

```bash
# 必須（LLM呼び出し：方言変換・スキル評価・健康アドバイス）
export OPENROUTER_API_KEY="sk-or-v1-..."

# LLMモデル選択（オプション、デフォルト: anthropic/claude-sonnet-4）
export OPENROUTER_MODEL="anthropic/claude-sonnet-4"
# 利用可能モデル例:
# - anthropic/claude-sonnet-4 (推奨)
# - anthropic/claude-opus-4
# - google/gemini-2.0-flash-001
# - openai/gpt-4o
# - meta-llama/llama-3.3-70b

# HTTP起動時（Hostinger VPS / N8N連携）
export TRANSPORT=http
export PORT=3100

# オプション（VOICEVOX音声合成）
export VOICEVOX_URL=http://localhost:50021

# オプション（Botpress連携）
export BOTPRESS_WEBHOOK_SECRET="your-secret-key"
```

### OpenRouter API Key取得方法

1. https://openrouter.ai/ でアカウント作成
2. API Keys ページで新しいキーを生成
3. 無料クレジット: $10（試用に十分）
4. 従量課金: モデルごとに異なる（Claude Sonnet: ~$3/1M tokens）

## 実行

### stdio モード（Claude Desktop等）

```bash
npm run dev
# または
npm start
```

### HTTP モード（Hostinger VPS / N8N連携）

```bash
export TRANSPORT=http
export PORT=3100
npm start
```

エンドポイント:
- **MCP**: `POST http://localhost:3100/mcp`
- **Botpress Webhook**: `POST http://localhost:3100/bot`
- **Health Check**: `GET http://localhost:3100/health`

## Botpress連携セットアップ

### 1. Botpress Cloudアカウント作成

https://botpress.com/ でアカウント作成（無料枠あり）

### 2. Botpressでボット作成

新しいBotを作成し、LINE/Web Chatチャンネルを追加

### 3. インテント定義

| インテント | MCPツール | パラメータ例 |
|-----------|----------|-------------|
| `greet` | skill60_yoshiko_voice | `{ text: "こんにちは", region: "福井" }` |
| `ask_news` | skill60_fetch_news | `{ keyword: "年金", limit: 5 }` |
| `ask_pension` | skill60_nenkin_news | `{}` |
| `find_grants` | skill60_search_jgrants | `{ keyword: "創業" }` |
| `find_jobs` | skill60_market_value | `{ skills: ["経理"], region: "東京" }` |
| `health_check` | skill60_health_info | `{ category: "checkup" }` |
| `weather` | skill60_weather_advice | `{ region: "福井" }` |

### 4. Webhook設定

Botpressの Settings → Webhooks:
- URL: `https://{VPS_IP}:3100/bot`
- Method: POST
- Headers: `x-botpress-signature: {BOTPRESS_WEBHOOK_SECRET}`

### 5. LINE連携（オプション）

Botpress Cloud で LINE Messaging API を連携
- LINE Developers で Channel作成
- Channel Secret / Access Token を Botpress に設定

## VOICEVOX連携セットアップ

### 1. VOICEVOX Engine起動（Docker）

```bash
# VPSの場合
docker run -d -p 50021:50021 voicevox/voicevox_engine:latest

# ローカルの場合
# https://voicevox.hiroshiba.jp/ からダウンロード
```

### 2. 環境変数設定

```bash
export VOICEVOX_URL=http://localhost:50021
```

### 3. テスト

```bash
curl http://localhost:50021/speakers
```

### 4. おすすめスピーカー（ヨシコ用）

- **波音リツ (ID: 9)**: 自然な女性の声（デフォルト推奨）
- **春日部つむぎ (ID: 8)**: 落ち着いた大人の女性
- **四国めたん (ID: 2)**: はっきりした声

速度: 0.85〜0.95（シニア向けにゆっくり）

## N8Nワークフロー統合例

```
[朝7時 cronトリガー]
  ↓
[SKILL60+ MCP /mcp エンドポイント]
  ├→ skill60_fetch_news(keyword="年金 シニア")
  ├→ skill60_nenkin_news()
  ├→ skill60_weather_advice(region="福井")
  └→ skill60_market_value(skills=["経理"], region="福井")
  ↓
[情報統合ノード]
  ↓
[skill60_yoshiko_voice(text=統合テキスト, region="福井")]
  ↓
[skill60_text_to_speech(text=ヨシコテキスト)] ※オプション
  ↓
[LINE Messaging API送信]
  ├→ テキストメッセージ（ヨシコの声）
  └→ 音声メッセージ（VOICEVOXのWAV）
```

## バージョン履歴

### v3.0.0（2026-02-14）
- ✅ **OpenRouter API対応**（Anthropic API → OpenRouter API）
- ✅ モデル切り替え可能（環境変数 OPENROUTER_MODEL）
- ✅ 市場価値・求人検索ツール追加（Indeed/ハロワ/シルバー人材）
- ✅ スキル市場評価ツール追加（LLM）
- ✅ 健康情報取得ツール追加（厚労省）
- ✅ 天気ベース健康アドバイス追加（気象庁API + LLM）
- ✅ Botpress連携（LINE/Web UI フロント）
- ✅ VOICEVOX音声合成連携
- ✅ LLM API共通化リファクタ（services/llm.ts）

### v2.1.0
- ✅ 方言変換ツール追加（Claude API）
- ✅ ヨシコの声ツール追加（AI友人キャラクター）

### v2.0.0
- ✅ サイトリアルタイム取得版
- ✅ 9ツール実装

## ライセンス

MIT
