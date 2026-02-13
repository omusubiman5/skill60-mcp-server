// SKILL60+ シニア特典 - JR各社/航空/小売サイトからリアルタイム取得

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchSite, stripHtml } from "../services/fetcher.js";
import { logError } from "../services/db.js";

const SITES = {
  zipangu: {
    url: "https://www.jreast.co.jp/otona/zipangu/",
    label: "JRジパング倶楽部",
    category: "transport",
  },
  otonavi: {
    url: "https://www.jr-odekake.net/goyoyaku/otonavi/",
    label: "おとなびWEB早特（JR西日本）",
    category: "transport",
  },
  jreast_otona: {
    url: "https://www.jreast.co.jp/otona/",
    label: "大人の休日倶楽部（JR東日本）",
    category: "transport",
  },
  fullmoon: {
    url: "https://www.jreast.co.jp/tickets/info.aspx?GoodsCd=2817",
    label: "フルムーン夫婦グリーンパス",
    category: "transport",
  },
  jal_silver: {
    url: "https://www.jal.co.jp/jp/ja/dom/fare/rule/r_silver.html",
    label: "JAL当日シルバー割引",
    category: "travel",
  },
  ana_senior: {
    url: "https://www.ana.co.jp/ja/jp/book-plan/fare/domestic/smart-senior/",
    label: "ANAスマートシニア空割",
    category: "travel",
  },
} as const;

type SiteKey = keyof typeof SITES;

const FetchSchema = z.object({
  sites: z.array(z.enum(["zipangu", "otonavi", "jreast_otona", "fullmoon", "jal_silver", "ana_senior", "all"]))
    .default(["all"])
    .describe("取得するサイト（複数指定可。'all'で全サイト）"),
}).strict();

const ScrapeSchema = z.object({
  url: z.string().url()
    .describe("取得するURL（JR/航空/シニア特典関連サイト）"),
  maxChars: z.number().int().min(500).max(5000).default(2000)
    .describe("取得する最大文字数"),
}).strict();

async function scrapeSite(url: string, maxChars: number): Promise<string> {
  const html = await fetchSite(url);

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  const contentMatch = html.match(/<div[^>]*(?:id|class)="(?:content|main|article)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);

  const raw = mainMatch?.[1] ?? contentMatch?.[1] ?? bodyMatch?.[1] ?? html;

  const cleaned = raw
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const text = stripHtml(cleaned);
  return text.length > maxChars ? text.slice(0, maxChars) + "\n\n（...省略。全文は公式サイトをご確認ください）" : text;
}

export function registerBenefitTools(server: McpServer): void {
  server.registerTool(
    "skill60_fetch_senior_sites",
    {
      title: "シニア特典サイト一括取得（リアルタイム）",
      description: `JRジパング倶楽部、おとなびWEB早特、大人の休日倶楽部、フルムーン夫婦グリーンパス、JALシルバー割引、ANAスマートシニア空割の各公式サイトをリアルタイムで取得します。

サイト一覧:
- zipangu: JRジパング倶楽部
- otonavi: おとなびWEB早特（JR西日本）
- jreast_otona: 大人の休日倶楽部（JR東日本）
- fullmoon: フルムーン夫婦グリーンパス
- jal_silver: JAL当日シルバー割引
- ana_senior: ANAスマートシニア空割
- all: 全サイト

実際のサイトを今この瞬間に見に行き、最新の料金・条件を取得します。`,
      inputSchema: FetchSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      const targets: SiteKey[] = params.sites.includes("all")
        ? (Object.keys(SITES) as SiteKey[])
        : params.sites.filter((s): s is SiteKey => s !== "all" && s in SITES);

      const results = await Promise.allSettled(
        targets.map(async (key) => {
          const site = SITES[key];
          const content = await scrapeSite(site.url, 1500);
          return { key, label: site.label, url: site.url, content };
        })
      );

      const text = results.map((r, i) => {
        if (r.status === "fulfilled") {
          const { label, url, content } = r.value;
          return `━━━ ${i + 1}. ${label} ━━━\n🔗 ${url}\n\n${content}`;
        } else {
          return `━━━ ${i + 1}. 取得失敗 ━━━\n${r.reason}`;
        }
      }).join("\n\n");

      const okCount = results.filter(r => r.status === "fulfilled").length;

      return {
        content: [{
          type: "text" as const,
          text: `🎁 シニア特典サイト（${okCount}/${targets.length}サイト取得成功）\n\n${text}`,
        }],
      };
    }
  );

  server.registerTool(
    "skill60_scrape_url",
    {
      title: "任意のURL本文取得（汎用スクレイパー）",
      description: `指定したURLのページ本文をリアルタイムで取得します。
シニア向け特典サイト・自治体ページ・求人サイト等、任意のURLに対応。

HTMLのメインコンテンツを自動抽出し、テキストとして返します。`,
      inputSchema: ScrapeSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const content = await scrapeSite(params.url, params.maxChars);
        return {
          content: [{ type: "text" as const, text: `🌐 ${params.url}\n\n${content}` }],
        };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_scrape_url", `URL取得エラー: ${errorMsg}`, params);
        return { content: [{ type: "text" as const, text: `❌ URL取得エラー: ${errorMsg}` }] };
      }
    }
  );
}
