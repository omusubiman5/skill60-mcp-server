// SKILL60+ 年金法令 - e-Gov法令APIから条文取得（認証不要の公開API）
// https://laws.e-gov.go.jp/api/1/lawdata/{法令ID}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "../services/fetcher.js";
import { logError } from "../services/db.js";

// === 年金関連法令ID ===

const PENSION_LAWS: Record<string, { lawId: string; name: string; description: string }> = {
  national_pension: {
    lawId: "334AC0000000141",
    name: "国民年金法",
    description: "自営業者・学生・無職の方が加入する基礎年金（国民年金）の法律",
  },
  employee_pension: {
    lawId: "329AC0000000115",
    name: "厚生年金保険法",
    description: "会社員・公務員が加入する厚生年金の法律",
  },
};

// === e-Gov 法令API レスポンス型 ===

interface LawArticle {
  ArticleTitle?: string;
  ArticleCaption?: string;
  Paragraph?: Array<{
    ParagraphNum?: string;
    ParagraphSentence?: Array<{ Sentence?: string }> | { Sentence?: string };
    Item?: Array<{
      ItemTitle?: string;
      ItemSentence?: Array<{ Sentence?: string }> | { Sentence?: string };
    }>;
  }>;
}

interface LawBody {
  MainProvision?: {
    Chapter?: Array<{
      ChapterTitle?: string;
      Article?: LawArticle | LawArticle[];
    }>;
    Article?: LawArticle | LawArticle[];
  };
}

interface EGovLawResponse {
  law?: {
    LawNum?: string;
    LawBody?: LawBody;
    LawTitle?: string;
  };
  law_full_text?: {
    LawNum?: string;
    LawBody?: LawBody;
    LawTitle?: string;
  };
}

// === 条文テキスト抽出ヘルパー ===

function extractSentence(
  s: Array<{ Sentence?: string }> | { Sentence?: string } | undefined
): string {
  if (!s) return "";
  if (Array.isArray(s)) return s.map(x => x.Sentence ?? "").join(" ");
  return s.Sentence ?? "";
}

function extractArticleText(article: LawArticle): string {
  const lines: string[] = [];
  if (article.ArticleTitle) lines.push(`【${article.ArticleTitle}】`);
  if (article.ArticleCaption) lines.push(article.ArticleCaption);

  for (const para of article.Paragraph ?? []) {
    const sentence = extractSentence(para.ParagraphSentence);
    if (sentence) lines.push(`  ${para.ParagraphNum ?? ""}　${sentence}`);
    for (const item of para.Item ?? []) {
      const itemSentence = extractSentence(item.ItemSentence);
      if (item.ItemTitle || itemSentence) {
        lines.push(`    ${item.ItemTitle ?? ""}　${itemSentence}`);
      }
    }
  }
  return lines.join("\n");
}

function findArticleByNumber(body: LawBody, articleNum: string): LawArticle | undefined {
  const search = (articles: LawArticle | LawArticle[] | undefined): LawArticle | undefined => {
    if (!articles) return undefined;
    const arr = Array.isArray(articles) ? articles : [articles];
    return arr.find(a => {
      const title = a.ArticleTitle ?? "";
      return title.includes(articleNum) || title === `第${articleNum}条` || title === articleNum;
    });
  };

  // トップレベルのArticle
  const topLevel = search(body.MainProvision?.Article);
  if (topLevel) return topLevel;

  // Chapter内のArticle
  for (const chapter of body.MainProvision?.Chapter ?? []) {
    const found = search(chapter.Article);
    if (found) return found;
  }
  return undefined;
}

function searchArticlesByKeyword(body: LawBody, keyword: string): LawArticle[] {
  const results: LawArticle[] = [];

  const collectArticles = (articles: LawArticle | LawArticle[] | undefined): void => {
    if (!articles) return;
    const arr = Array.isArray(articles) ? articles : [articles];
    for (const a of arr) {
      const text = extractArticleText(a);
      if (text.includes(keyword)) results.push(a);
    }
  };

  collectArticles(body.MainProvision?.Article);
  for (const chapter of body.MainProvision?.Chapter ?? []) {
    collectArticles(chapter.Article);
  }
  return results.slice(0, 3);
}

// === スキーマ定義 ===

const PensionLawSchema = z.object({
  law: z.enum(["national_pension", "employee_pension"]).default("national_pension")
    .describe("法令: national_pension(国民年金法), employee_pension(厚生年金保険法)"),
  article: z.string().max(20).default("")
    .describe("条文番号（例: '16', '第16条'）。省略時はkeywordで検索"),
  keyword: z.string().max(100).default("")
    .describe("条文内キーワード検索（例: '受給権', '繰り下げ', '障害'）"),
}).strict();

// === ツール登録 ===

export function registerPensionTools(server: McpServer): void {

  server.registerTool(
    "skill60_pension_law",
    {
      title: "年金法令条文取得（e-Gov法令API）",
      description: `e-Gov法令API（認証不要）から年金関連法令の条文を取得します。

対応法令:
- national_pension: 国民年金法（法令ID: 334AC0000000141）
- employee_pension: 厚生年金保険法（法令ID: 329AC0000000115）

使用方法:
- article に条文番号を指定（例: article="16"）→ 該当条文を返す
- keyword に検索語を指定（例: keyword="受給権"）→ 関連条文を返す（最大3件）
- 両方省略時 → 法令の基本情報を返す

**このツールは条文テキストを返すのみ。解釈・アドバイスは行いません。**
LLM側で解釈・説明を生成してください。`,
      inputSchema: PensionLawSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      const lawInfo = PENSION_LAWS[params.law]!;
      const url = `https://laws.e-gov.go.jp/api/1/lawdata/${lawInfo.lawId}`;
      const eGovUrl = `https://elaws.e-gov.go.jp/document?lawid=${lawInfo.lawId}`;

      try {
        let data: EGovLawResponse;
        try {
          data = await fetchJson<EGovLawResponse>(url);
        } catch (fetchErr) {
          const fetchMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          await logError("skill60_pension_law", `e-Gov法令API 利用不可: ${fetchMsg}`, params);
          return {
            content: [{
              type: "text" as const,
              text: `⚠️ e-Gov法令API は現在利用できません（${fetchMsg}）\n\n` +
                `公式サイトで直接確認してください:\n` +
                `🔗 ${eGovUrl}\n\n` +
                `法令名: ${lawInfo.name}\n` +
                `説明: ${lawInfo.description}`,
            }],
          };
        }

        const lawData = data.law ?? data.law_full_text;
        if (!lawData) {
          return {
            content: [{
              type: "text" as const,
              text: `⚠️ 法令データが取得できませんでした。\n\n直接確認: 🔗 ${eGovUrl}`,
            }],
          };
        }

        const body = lawData.LawBody;
        const lawTitle = lawData.LawTitle ?? lawInfo.name;
        const lawNum = lawData.LawNum ?? "";

        // 条文番号指定
        if (params.article) {
          if (!body) {
            return {
              content: [{
                type: "text" as const,
                text: `⚠️ 法令本文が取得できませんでした。\n\n直接確認: 🔗 ${eGovUrl}`,
              }],
            };
          }
          const article = findArticleByNumber(body, params.article);
          if (!article) {
            return {
              content: [{
                type: "text" as const,
                text: `📜 ${lawTitle}（${lawNum}）\n\n` +
                  `第${params.article}条 は見つかりませんでした。\n\n` +
                  `🔗 全文確認: ${eGovUrl}`,
              }],
            };
          }
          return {
            content: [{
              type: "text" as const,
              text: `📜 ${lawTitle}（${lawNum}）\n\n` +
                extractArticleText(article) + "\n\n" +
                `🔗 出典: ${eGovUrl}`,
            }],
          };
        }

        // キーワード検索
        if (params.keyword) {
          if (!body) {
            return {
              content: [{
                type: "text" as const,
                text: `⚠️ 法令本文が取得できませんでした。\n\n直接確認: 🔗 ${eGovUrl}`,
              }],
            };
          }
          const articles = searchArticlesByKeyword(body, params.keyword);
          if (articles.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `📜 ${lawTitle}（${lawNum}）\n\n` +
                  `「${params.keyword}」を含む条文は見つかりませんでした。\n\n` +
                  `🔗 全文確認: ${eGovUrl}`,
              }],
            };
          }
          const text = articles.map(a => extractArticleText(a)).join("\n\n---\n\n");
          return {
            content: [{
              type: "text" as const,
              text: `📜 ${lawTitle}（${lawNum}）\n` +
                `「${params.keyword}」を含む条文（最大3件）:\n\n` +
                text + "\n\n" +
                `🔗 出典: ${eGovUrl}`,
            }],
          };
        }

        // 基本情報のみ
        return {
          content: [{
            type: "text" as const,
            text: `📜 ${lawTitle}（${lawNum}）\n\n` +
              `${lawInfo.description}\n\n` +
              `使用例:\n` +
              `- article="16" を指定 → 特定条文を取得\n` +
              `- keyword="受給権" を指定 → 関連条文を検索\n\n` +
              `🔗 全文: ${eGovUrl}`,
          }],
        };

      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await logError("skill60_pension_law", `全体エラー: ${errorMsg}`, params);
        return {
          content: [{
            type: "text" as const,
            text: `❌ 年金法令取得エラー: ${errorMsg}`,
          }],
        };
      }
    }
  );
}
