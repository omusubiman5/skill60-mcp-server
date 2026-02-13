# SKILL60+ MCP Server v2.1 — サイト参照版 + 方言変換

シニア（60歳以上）の生活をバックアップする MCP サーバー。
**全ての情報を実際のサイトからリアルタイム取得** + **Claude APIで自然な方言変換**。

AI友人ヨシコの「知識の引き出し」と「声」。田中さんが半日かけて調べることを、朝のLINE1通で解決する。

## 9つのツール

| ツール | 情報源 | 方式 |
|--------|--------|------|
| `skill60_fetch_news` | NHK News Web / Yahoo!ニュース | RSS リアルタイム取得 |
| `skill60_search_jgrants` | デジタル庁 jGrants | 公開API リアルタイム検索 |
| `skill60_jgrants_detail` | デジタル庁 jGrants | 公開API 詳細取得 |
| `skill60_nenkin_news` | 日本年金機構 | サイト スクレイピング |
| `skill60_nenkin_page` | 日本年金機構 | サイト ページ本文取得 |
| `skill60_fetch_senior_sites` | JRジパング / おとなび / JAL / ANA | サイト 一括スクレイピング |
| `skill60_scrape_url` | 任意のURL | 汎用スクレイパー |
| `skill60_dialect_convert` | Claude API | 方言変換（全国対応） |
| `skill60_yoshiko_voice` | Claude API | ヨシコの声（AI友人キャラクター） |

## 方言変換ツール（v2.1 新機能）

辞書ベース（語尾だけ変わる）ではなく、Claude APIの言語力で **語彙・表現・言い回し** まで含めた本物の方言を生成。

### skill60_dialect_convert
- **対応地域**: 福井, 大阪, 京都, 博多, 広島, 名古屋, 東北, 沖縄, 北海道, 秋田, 津軽, 鹿児島, 石川, 富山 + 任意の地域
- **口調**: friendly / gentle / energetic / elderly
- **濃さ**: light（ほんのり）/ medium（自然）/ strong（ガッツリ）

### skill60_yoshiko_voice
- 60代女性「ヨシコ」のキャラクターでテキストを変換
- 冷たい行政情報 → 温かい友人のアドバイスに変換
- 「こんなんあったんやけど、知っとる？」と自然に教えてくれる

## セットアップ

```bash
npm install
npm run build
```

## 環境変数

```bash
# 方言変換に必要（skill60_dialect_convert / skill60_yoshiko_voice）
export ANTHROPIC_API_KEY="sk-ant-..."

# HTTP起動時（Hostinger VPS）
export TRANSPORT=http
export PORT=3100
```

## 起動

### stdio（ローカル / Claude Desktop / Claude Code）
```bash
npm start
```

### HTTP（Hostinger VPS / リモート）
```bash
TRANSPORT=http PORT=3100 ANTHROPIC_API_KEY=sk-ant-... node dist/index.js
```

## Claude Desktop 設定

```json
{
  "mcpServers": {
    "skill60": {
      "command": "node",
      "args": ["/path/to/skill60-mcp-server/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

## 設計思想

- **全ての経験は価値がある**: 生活スキルも市場価値として評価
- **AIは友人**: ヨシコが自然に教える（方言で！）
- **距離を味方にする**: 地方在住シニアの地理的優位性
- **元気な老人→誰も損しない**: 6者全員が得をする

## 技術スタック

- TypeScript + MCP SDK v1.12
- Express（HTTP transport / Hostinger VPS対応）
- Zod（入力バリデーション）
- Anthropic Claude API（方言変換）
- NHK / Yahoo RSS（ニュース）
- jGrants API（デジタル庁 公開API）
- nenkin.go.jp スクレイピング
- JR各社 / 航空各社 サイトスクレイピング

## バージョン履歴

| バージョン | 内容 |
|---|---|
| v1.0 | ハードコード版（助成金6件、年金固定テキスト、特典15件） |
| v2.0 | サイト参照版（jGrants API、NHK/Yahoo RSS、スクレイピング） |
| v2.1 | 方言変換追加（Claude API、ヨシコの声、全国14地域ヒント） |
