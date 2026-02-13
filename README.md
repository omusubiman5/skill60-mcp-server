# SKILL60+ MCP Server v3.1 — データ取得専用版（LLMなし）

シニア（60歳以上）の生活をバックアップする MCP サーバー。
**全ての情報を実際のサイトからリアルタイム取得**します（ハードコードなし）。

**v3.1の特徴**: LLM処理を完全削除。MCPは純粋なデータ取得サーバーとして機能し、LLM側（Claude等）がデータを受け取って分析・アドバイスを生成します。

AI友人ヨシコの「知識の引き出し」。田中さんが半日かけて調べることを、朝のLINE1通で解決する。

## 13のツール

| ツール | 情報源 | 方式 | 備考 |
|--------|--------|------|------|
| `skill60_fetch_news` | NHK News Web / Yahoo!ニュース | RSS リアルタイム取得 | 生データのみ |
| `skill60_search_jgrants` | デジタル庁 jGrants | 公開API リアルタイム検索 | 生データのみ |
| `skill60_jgrants_detail` | デジタル庁 jGrants | 公開API 詳細取得 | 生データのみ |
| `skill60_nenkin_news` | 日本年金機構 | サイト スクレイピング | 生データのみ |
| `skill60_nenkin_page` | 日本年金機構 | サイト ページ本文取得 | 生データのみ |
| `skill60_fetch_senior_sites` | JRジパング / おとなび / JAL / ANA | サイト 一括スクレイピング | 生データのみ |
| `skill60_scrape_url` | 任意のURL | 汎用スクレイパー | 生データのみ |
| `skill60_market_value` | Indeed / ハロワ / シルバー人材 | RSS検索 / サイト取得 | v3.1新規（生データのみ） |
| `skill60_health_info` | 厚労省 / e-ヘルスネット | サイト取得 | v3.1新規（生データのみ） |
| `skill60_weather` | 気象庁API | 公開API | v3.1新規（生データのみ） |
| `skill60_dialect_data` | NINJAL方言データベース | 方言辞書 | v3.1新規（生データのみ） |
| `skill60_botpress_send` | Botpress Webhook | Webhook送信 | v3.1新規（生データのみ） |
| `skill60_text_to_speech` | VOICEVOX Engine | 音声合成 | v3.1新規（生データのみ） |

### 管理用ツール
- `skill60_get_errors`: エラーログ取得（MongoDB）
- `skill60_tool_status`: 全ツールの動作状態確認

## v3.1 アーキテクチャ

### 設計思想
- **データ取得に特化**: MCPサーバーはデータ取得のみを担当
- **LLM処理の外部化**: 分析・アドバイス・方言変換等は全てLLM側（Claude等）で実行
- **エラー監視**: MongoDB Atlasでエラーログを収集・分析
- **フェールセーフ**: MongoDB未接続でもサーバーは正常動作（ログなしで継続）

### アーキテクチャ図
```
┌─────────────────┐
│   Claude API    │ ← LLM分析・アドバイス生成
│  (LLM処理層)    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  SKILL60+ MCP   │ ← データ取得専用
│   Server v3.1   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐         ┌─────────────────┐
│  外部サイト/API  │         │  MongoDB Atlas  │
│  (データソース)  │         │  (エラーログ)   │
└─────────────────┘         └─────────────────┘
```

### v2.1 → v3.1 の変更点

| v2.1（LLM統合版） | v3.1（データ専用版） |
|---|---|
| 方言変換をMCP内で実行 | 方言データを返すのみ |
| ヨシコキャラクター変換をMCP内で実行 | キャラクター情報を返すのみ |
| Claude APIをMCP内で呼び出し | LLM呼び出しなし |
| services/claude.ts存在 | 完全削除 |
| エラーログなし | MongoDB Atlas統合 |

## セットアップ

### 必須環境変数
```bash
# MongoDB Atlas（オプション、なくても動作）
MONGODB_URI="mongodb+srv://..."

# Botpress統合（オプション）
BOTPRESS_WEBHOOK_URL="https://..."
BOTPRESS_BOT_ID="..."

# VOICEVOX統合（オプション）
VOICEVOX_API_URL="http://localhost:50021"
```

### インストール
```bash
npm install
npm run build
```

## 起動

### stdio（ローカル / Claude Desktop / Claude Code）
```bash
npm start
# or
node dist/index.js
```

### HTTP（Hostinger VPS / リモート）
```bash
TRANSPORT=http PORT=3100 node dist/index.js
```

## Claude Desktop 設定

`claude_desktop_config.json` に追加:

```json
{
  "mcpServers": {
    "skill60": {
      "command": "node",
      "args": ["/path/to/skill60-mcp-server/dist/index.js"],
      "env": {
        "MONGODB_URI": "mongodb+srv://..."
      }
    }
  }
}
```

## 使い方

### データ取得 → LLM分析のパターン

```typescript
// 1. MCPツールでデータ取得
const dialectData = await mcp.call("skill60_dialect_data", { region: "福井" });

// 2. LLM側で分析・変換
const prompt = `
以下の方言データを使って、「今日はいい天気ですね」を福井弁に変換してください。

${dialectData}
`;

const result = await claude.complete(prompt);
// → "今日はええ天気やざのぉ"
```

### 全ツールの動作確認

```bash
# ツールステータス確認
mcp.call("skill60_tool_status")

# エラーログ確認
mcp.call("skill60_get_errors", { limit: 50 })
```

## エラー監視

MongoDB Atlasに全エラーログを記録:
- **ツール名**: どのツールでエラーが発生したか
- **エラーメッセージ**: 詳細なエラー内容
- **タイムスタンプ**: 発生日時
- **パラメータ**: エラー発生時のリクエストパラメータ

### エラーログスキーマ
```typescript
interface ErrorLog {
  tool: string;              // ツール名
  message: string;           // エラーメッセージ
  details?: unknown;         // 詳細情報（パラメータ等）
  timestamp: Date;           // 発生日時
  level: "error" | "warn" | "info";  // ログレベル
}
```

## 技術スタック

- TypeScript + MCP SDK v1.12
- Express（HTTP transport / Hostinger VPS対応）
- MongoDB Atlas（エラーログ管理）
- Zod（入力バリデーション）
- NHK / Yahoo RSS（ニュースリアルタイム取得）
- jGrants API（デジタル庁 公開API / 認証不要）
- nenkin.go.jp スクレイピング（年金機構）
- JR各社 / 航空各社 サイトスクレイピング
- 汎用URLスクレイパー（任意サイト対応）
- Indeed RSS（求人検索）
- 気象庁API（天気予報）
- NINJAL方言データ（国立国語研究所）
- Botpress Webhook（チャットボット統合）
- VOICEVOX Engine（音声合成）

## バージョン履歴

### v3.1.0 (2025-02-12)
- **LLM処理完全削除**: MCPは純粋なデータ取得サーバーに
- **MongoDB統合**: エラーログ管理機能追加
- **新ツール追加**: 市場価値検索、健康情報、天気予報、方言データ、Botpress、VOICEVOX
- **アーキテクチャ変更**: データ取得とLLM処理の完全分離

### v3.0.0 (2025-02-11)
- OpenRouter API統合（Anthropic APIから移行）
- 市場価値検索、健康情報、Botpress、VOICEVOX統合（LLM処理あり）

### v2.1.0 (2025-01-20)
- 方言変換機能追加（Claude API統合）
- ヨシコキャラクター機能追加

### v2.0.0 (2025-01-15)
- サイト参照版リリース
- jGrants API統合
- 年金機構スクレイピング
- シニア特典サイト一括取得

### v1.0.0 (2025-01-10)
- 初版リリース（ハードコード版）

## 設計思想

- **全ての経験は価値がある**: 生活スキル（料理・庭仕事・墓参り）も市場価値として評価
- **AIは友人**: ヨシコが「こんな情報がありますよ」と自然に教える
- **距離を味方にする**: 地方在住シニアの地理的優位性をマッチングに活用
- **元気な老人→誰も損しない**: 6者（本人・家族・地域・企業・自治体・国）全員が得をする
- **データとLLMの分離**: MCPはデータ取得、LLMは分析・アドバイス生成

## ライセンス

MIT License

## 開発

```bash
# 開発サーバー（TypeScript直接実行）
npm run dev

# ビルド
npm run build

# 本番起動
npm start
```

## トラブルシューティング

### MongoDB接続エラー
→ 環境変数 `MONGODB_URI` を確認。未設定でもサーバーは起動します（ログなし）。

### VOICEVOX接続エラー
→ VOICEVOX Engineが起動しているか確認。デフォルトURL: `http://localhost:50021`

### Botpress送信エラー
→ `BOTPRESS_WEBHOOK_URL` と `BOTPRESS_BOT_ID` を確認。
