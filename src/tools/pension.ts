// SKILL60+ 年金 - 日本年金機構サイトからリアルタイム取得
// https://www.nenkin.go.jp の新着情報・お知らせを取得

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSite, stripHtml } from "../services/fetcher.js";
import { logError } from "../services/db.js";

const NENKIN_BASE = "https://www.nenkin.go.jp";

const NewsSchema = z.object({
  limit: z.number().int().min(1).max(20).default(10)
    .describe("取得件数"),
}).strict();

const PageSchema = z.object({
  path: z.string().min(1).max(300)
    .describe("年金機構サイトのパス（例: '/service/jukyu/roureinenkin/jukyu-yoken/20150401-02.html'）"),
}).strict();

async function fetchNenkinNews(limit: number): Promise<Array<{ date: string; title: string; url: string }>> {
  const html = await fetchSite(NENKIN_BASE);
  const results: Array<{ date: string; title: string; url: string }> = [];

  const pattern1 = /<dt[^>]*>([\d.\/]+)<\/dt>\s*<dd[^>]*><a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern1.exec(html)) !== null && results.length < limit) {
    results.push({
      date: m[1] ?? "",
      title: stripHtml(m[3] ?? ""),
      url: (m[2] ?? "").startsWith("http") ? (m[2] ?? "") : `${NENKIN_BASE}${m[2] ?? ""}`,
    });
  }

  if (results.length === 0) {
    const pattern2 = /<li[^>]*>\s*<span[^>]*>([\d.\/]+)<\/span>[\s\S]*?<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = pattern2.exec(html)) !== null && results.length < limit) {
      results.push({
        date: m[1] ?? "",
        title: stripHtml(m[3] ?? ""),
        url: (m[2] ?? "").startsWith("http") ? (m[2] ?? "") : `${NENKIN_BASE}${m[2] ?? ""}`,
      });
    }
  }

  if (results.length === 0) {
    results.push(
      { date: "常設", title: "老齢年金の受給要件", url: `${NENKIN_BASE}/service/jukyu/roureinenkin/jukyu-yoken/20150401-02.html` },
      { date: "常設", title: "繰り下げ・繰り上げ受給", url: `${NENKIN_BASE}/service/jukyu/roureinenkin/kurisage-kuriage/20140421-02.html` },
      { date: "常設", title: "在職老齢年金", url: `${NENKIN_BASE}/service/jukyu/roureinenkin/zaishoku/20150401-01.html` },
      { date: "常設", title: "ねんきんネット", url: `${NENKIN_BASE}/n_net/` },
    );
  }

  return results.slice(0, limit);
}

async function fetchNenkinPage(path: string): Promise<string> {
  const url = path.startsWith("http") ? path : `${NENKIN_BASE}${path}`;
  const html = await fetchSite(url);

  let content = "";
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  const contentMatch = html.match(/<div[^>]*id="contentsInner"[^>]*>([\s\S]*?)<\/div>/);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);

  content = stripHtml(mainMatch?.[1] ?? contentMatch?.[1] ?? articleMatch?.[1] ?? "");

  if (content.length > 3000) {
    content = content.slice(0, 3000) + "\n\n（...以下省略。全文は公式サイトでご確認ください）";
  }

  return content || "ページの内容を取得できませんでした。公式サイトで直接ご確認ください。";
}

export function registerPensionTools(server: McpServer): void {
  server.registerTool(
    "skill60_nenkin_news",
    {
      title: "年金機構 新着情報（リアルタイム取得）",
      description: `日本年金機構 https://www.nenkin.go.jp のトップページから新着情報・お知らせをリアルタイムで取得します。

年金制度の最新変更、手続きのお知らせ等。
ヨシコが「年金のことで新しい情報が出てますよ」とLINEで教える情報源。`,
      inputSchema: NewsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const news = await fetchNenkinNews(params.limit);
        const text = news.map((n, i) =>
          `${i + 1}. [${n.date}] ${n.title}\n   ${n.url}`
        ).join("\n\n");

        return {
          content: [{
            type: "text" as const,
            text: `🏛️ 日本年金機構 新着情報（リアルタイム取得）\n\n${text}\n\n` +
              `💡 詳細を読むには skill60_nenkin_page にURLのパスを渡してください。\n` +
              `📞 年金ダイヤル: 0570-05-1165`,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_nenkin_news", `年金機構ニュース取得エラー: ${errorMsg}`, params);
        return { content: [{ type: "text" as const, text: `❌ 年金機構サイト取得エラー: ${errorMsg}` }] };
      }
    }
  );

  server.registerTool(
    "skill60_nenkin_page",
    {
      title: "年金機構 ページ本文取得（リアルタイム）",
      description: `日本年金機構の特定ページの本文をリアルタイムで取得・要約します。

主要ページのパス例:
- /service/jukyu/roureinenkin/jukyu-yoken/20150401-02.html（老齢基礎年金の受給要件）
- /service/jukyu/roureinenkin/kurisage-kuriage/20140421-02.html（繰り下げ受給）
- /service/jukyu/roureinenkin/zaishoku/20150401-01.html（在職老齢年金）
- /n_net/（ねんきんネット）`,
      inputSchema: PageSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const content = await fetchNenkinPage(params.path);
        const fullUrl = params.path.startsWith("http") ? params.path : `${NENKIN_BASE}${params.path}`;
        return {
          content: [{
            type: "text" as const,
            text: `🏛️ 年金機構ページ: ${fullUrl}\n\n${content}`,
          }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_nenkin_page", `年金機構ページ取得エラー: ${errorMsg}`, params);
        return { content: [{ type: "text" as const, text: `❌ ページ取得エラー: ${errorMsg}` }] };
      }
    }
  );
}
