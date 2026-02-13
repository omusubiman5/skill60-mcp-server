// SKILL60+ ニュース - NHK / Yahoo RSS リアルタイム取得

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSite, parseRssItems } from "../services/fetcher.js";

// NHKカテゴリ別RSS
const NHK_FEEDS: Record<string, { url: string; label: string }> = {
  top:      { url: "https://www3.nhk.or.jp/rss/news/cat0.xml", label: "主要" },
  society:  { url: "https://www3.nhk.or.jp/rss/news/cat1.xml", label: "社会" },
  science:  { url: "https://www3.nhk.or.jp/rss/news/cat3.xml", label: "科学文化" },
  politics: { url: "https://www3.nhk.or.jp/rss/news/cat4.xml", label: "政治" },
  life:     { url: "https://www3.nhk.or.jp/rss/news/cat5.xml", label: "暮らし" },
  business: { url: "https://www3.nhk.or.jp/rss/news/cat6.xml", label: "ビジネス" },
  local:    { url: "https://www3.nhk.or.jp/rss/news/cat7.xml", label: "地域" },
};

// Yahoo カテゴリ別RSS
const YAHOO_FEEDS: Record<string, { url: string; label: string }> = {
  top:      { url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml", label: "主要" },
  domestic: { url: "https://news.yahoo.co.jp/rss/topics/domestic.xml", label: "国内" },
  business: { url: "https://news.yahoo.co.jp/rss/topics/business.xml", label: "経済" },
  life:     { url: "https://news.yahoo.co.jp/rss/topics/life.xml", label: "ライフ" },
  local:    { url: "https://news.yahoo.co.jp/rss/topics/local.xml", label: "地域" },
  it:       { url: "https://news.yahoo.co.jp/rss/topics/it.xml", label: "IT" },
};

const Schema = z.object({
  source: z.enum(["nhk", "yahoo", "both"]).default("nhk")
    .describe("情報源: nhk / yahoo / both"),
  category: z.enum(["top", "society", "life", "business", "local", "science", "politics", "all"]).default("all")
    .describe("カテゴリ"),
  keyword: z.string().max(100).default("")
    .describe("フィルターキーワード（スペース区切りOR検索）"),
  limit: z.number().int().min(1).max(30).default(10)
    .describe("取得件数"),
}).strict();

async function grab(feedUrl: string, keyword: string, max: number): Promise<Array<{
  title: string; link: string; pubDate: string; description: string; source: string;
}>> {
  try {
    const xml = await fetchSite(feedUrl);
    let items = parseRssItems(xml);
    const src = feedUrl.includes("nhk") ? "NHK" : "Yahoo";

    if (keyword) {
      const kws = keyword.toLowerCase().split(/\s+/).filter(Boolean);
      items = items.filter(it => {
        const txt = `${it.title} ${it.description}`.toLowerCase();
        return kws.some(k => txt.includes(k));
      });
    }

    return items.slice(0, max).map(it => ({ ...it, source: src }));
  } catch (e) {
    return [{ title: `⚠️ 取得失敗: ${feedUrl}`, link: "", pubDate: "", description: String(e), source: "error" }];
  }
}

export function registerNewsTools(server: McpServer): void {
  server.registerTool(
    "skill60_fetch_news",
    {
      title: "ニュースRSS取得（NHK/Yahoo リアルタイム）",
      description: `NHK News Web / Yahoo!ニュースのRSSフィードをリアルタイムで取得します。
ハードコードではなく、実際のサイトを今この瞬間に見に行きます。

NHKカテゴリ: top(主要), society(社会), science(科学文化), politics(政治), life(暮らし), business(ビジネス), local(地域)
Yahoo カテゴリ: top(主要), domestic(国内), business(経済), life(ライフ), local(地域), it(IT)

キーワードでフィルター可能。シニア向けニュースの場合は keyword="シニア 高齢者 年金 健康" など。`,
      inputSchema: Schema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const results: Array<{ title: string; link: string; pubDate: string; description: string; source: string }> = [];

      const feeds: Array<{ url: string; label: string }> = [];
      const addFeeds = (map: Record<string, { url: string; label: string }>, cat: string) => {
        if (cat === "all") {
          feeds.push(...Object.values(map));
        } else if (map[cat]) {
          feeds.push(map[cat]!);
        }
      };

      if (params.source !== "yahoo") addFeeds(NHK_FEEDS, params.category);
      if (params.source !== "nhk") addFeeds(YAHOO_FEEDS, params.category === "society" ? "domestic" : params.category);

      const perFeed = Math.max(3, Math.ceil(params.limit / feeds.length));
      const batches = await Promise.allSettled(feeds.map(f => grab(f.url, params.keyword, perFeed)));

      for (const b of batches) {
        if (b.status === "fulfilled") results.push(...b.value);
      }

      const seen = new Set<string>();
      const unique = results.filter(r => {
        if (seen.has(r.title)) return false;
        seen.add(r.title);
        return true;
      }).slice(0, params.limit);

      const text = unique.length > 0
        ? unique.map((r, i) => {
          const date = r.pubDate ? new Date(r.pubDate).toISOString().slice(0, 16).replace("T", " ") : "";
          return `${i + 1}. 【${r.source}】${r.title}\n   ${date}\n   ${r.link}\n   ${r.description.slice(0, 150)}`;
        }).join("\n\n")
        : "該当するニュースが見つかりませんでした。";

      return {
        content: [{ type: "text" as const, text: `📰 ニュース ${unique.length}件取得（リアルタイム）\n\n${text}` }],
      };
    }
  );
}
