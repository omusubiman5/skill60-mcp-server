# SKILL60+ MCP Server v2 — サイト参照版

シニア（60歳以上）の生活をバックアップする MCP サーバー。
**全ての情報を実際のサイトからリアルタイム取得**します（ハードコードなし）。

AI友人ヨシコの「知識の引き出し」。田中さんが半日かけて調べることを、朝のLINE1通で解決する。

## 7つのツール

| ツール | 情報源 | 方式 |
|--------|--------|------|
| `skill60_fetch_news` | NHK News Web / Yahoo!ニュース | RSS リアルタイム取得 |
| `skill60_search_jgrants` | デジタル庁 jGrants | 公開API リアルタイム検索 |
| `skill60_jgrants_detail` | デジタル庁 jGrants | 公開API 詳細取得 |
| `skill60_nenkin_news` | 日本年金機構 | サイト スクレイピング |
| `skill60_nenkin_page` | 日本年金機構 | サイト ページ本文取得 |
| `skill60_fetch_senior_sites` | JRジパング / おとなび / JAL / ANA | サイト 一括スクレイピング |
| `skill60_scrape_url` | 任意のURL | 汎用スクレイパー |

## セットアップ

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
      "args": ["/path/to/skill60-mcp-server/dist/index.js"]
    }
  }
}
```

## 設計思想

- **全ての経験は価値がある**: 生活スキル（料理・庭仕事・墓参り）も市場価値として評価
- **AIは友人**: ヨシコが「こんな情報がありますよ」と自然に教える
- **距離を味方にする**: 地方在住シニアの地理的優位性をマッチングに活用
- **元気な老人→誰も損しない**: 6者（本人・家族・地域・企業・自治体・国）全員が得をする

## 技術スタック

- TypeScript + MCP SDK v1.12
- Express（HTTP transport / Hostinger VPS対応）
- Zod（入力バリデーション）
- NHK / Yahoo RSS（ニュースリアルタイム取得）
- jGrants API（デジタル庁 公開API / 認証不要）
- nenkin.go.jp スクレイピング（年金機構）
- JR各社 / 航空各社 サイトスクレイピング
- 汎用URLスクレイパー（任意サイト対応）

## v1 → v2 の変更点

| v1（ハードコード版） | v2（サイト参照版） |
|---|---|
| 助成金6件を手動登録 | jGrants API で数千件をリアルタイム検索 |
| 年金情報を固定テキスト | nenkin.go.jp から最新情報を直接取得 |
| 特典15件を手動登録 | JR/航空6サイトを一括スクレイピング |
| ニュースは取得試行のみ | NHK+Yahoo RSSを並列取得・フィルタリング |
