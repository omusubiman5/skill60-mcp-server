// SKILL60+ 助成金 - jGrants API リアルタイム取得
// デジタル庁公開API https://api.jgrants-portal.go.jp

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchJson } from "../services/fetcher.js";

const JGRANTS_BASE = "https://api.jgrants-portal.go.jp/exp/v1/public/subsidies";
const JGRANTS_V2 = "https://api.jgrants-portal.go.jp/exp/v2/public/subsidies/id";

interface JGrantsListResponse {
  metadata: { resultset: { count: number } };
  result: Array<{
    id: string;
    name: string;
    title: string;
    target_area_search?: string;
    subsidy_max_limit?: number;
    acceptance_start_datetime?: string;
    acceptance_end_datetime?: string;
    target_number_of_employees?: string;
  }>;
}

interface JGrantsDetailResponse {
  metadata: { resultset: { count: number } };
  result: Array<{
    id: string;
    title: string;
    subsidy_catch_phrase?: string;
    detail?: string;
    use_purpose?: string;
    industry?: string;
    target_area_search?: string;
    target_area_detail?: string;
    subsidy_rate?: string;
    subsidy_max_limit?: number;
    acceptance_start_datetime?: string;
    acceptance_end_datetime?: string;
    front_subsidy_detail_page_url?: string;
    workflow?: Array<{
      target_area_search?: string;
      fiscal_year_round?: string;
      acceptance_start_datetime?: string;
      acceptance_end_datetime?: string;
    }>;
  }>;
}

const SearchSchema = z.object({
  keyword: z.string().max(200).default("高齢者")
    .describe("検索キーワード（例: 'シニア', '高齢者', '再就職', 'IT導入'）"),
  area: z.string().max(50).default("")
    .describe("地域絞り込み（例: '福井県', '東京都'）空欄で全国"),
  limit: z.number().int().min(1).max(20).default(10)
    .describe("取得件数"),
}).strict();

const DetailSchema = z.object({
  subsidyId: z.string().min(1).max(18)
    .describe("補助金ID（一覧取得で得たid）"),
}).strict();

export function registerSubsidyTools(server: McpServer): void {
  server.registerTool(
    "skill60_search_jgrants",
    {
      title: "jGrants補助金検索（リアルタイムAPI）",
      description: `デジタル庁のjGrants APIに直接アクセスし、補助金・助成金をリアルタイム検索します。
ハードコードデータではなく、今この瞬間の最新情報を取得します。

API: https://api.jgrants-portal.go.jp/exp/v1/public/subsidies
認証不要・無料の公開API。

シニア向け検索のコツ:
- keyword="高齢者" で高齢者向け制度
- keyword="シニア 再就職" で再就職支援
- keyword="デジタル活用" でデジタル支援
- area="福井県" で地域絞り込み

返却された id を skill60_jgrants_detail に渡すと詳細が取得できます。`,
      inputSchema: SearchSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const q = new URLSearchParams();
        q.set("keyword", params.keyword);
        if (params.area) q.set("target_area_search", params.area);
        q.set("limit", String(params.limit));

        const url = `${JGRANTS_BASE}?${q.toString()}`;
        const data = await fetchJson<JGrantsListResponse>(url);

        const items = data.result ?? [];
        const total = data.metadata?.resultset?.count ?? items.length;

        if (items.length === 0) {
          return { content: [{ type: "text" as const, text: `jGrants API: 「${params.keyword}」の検索結果は0件でした。\n別のキーワードをお試しください。` }] };
        }

        const text = items.map((s, i) => {
          const deadline = s.acceptance_end_datetime
            ? new Date(s.acceptance_end_datetime).toISOString().slice(0, 10)
            : "未定";
          const maxAmount = s.subsidy_max_limit
            ? `${(s.subsidy_max_limit / 10000).toLocaleString()}万円`
            : "記載なし";
          return `${i + 1}. ${s.title}\n` +
            `   ID: ${s.id}\n` +
            `   地域: ${s.target_area_search ?? "全国"} | 上限: ${maxAmount} | 締切: ${deadline}\n` +
            `   従業員: ${s.target_number_of_employees ?? "制限なし"}`;
        }).join("\n\n");

        return {
          content: [{
            type: "text" as const,
            text: `💰 jGrants 補助金検索結果（リアルタイム）\n` +
              `🔍 「${params.keyword}」${params.area ? ` / ${params.area}` : ""} → ${total}件中${items.length}件表示\n\n` +
              text +
              `\n\n💡 詳細を見るには skill60_jgrants_detail にIDを渡してください。`,
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `❌ jGrants API エラー: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );

  server.registerTool(
    "skill60_jgrants_detail",
    {
      title: "jGrants補助金詳細取得（リアルタイムAPI）",
      description: `jGrants APIから補助金の詳細情報を取得します。
skill60_search_jgrants で得たIDを渡してください。

取得情報: 概要・対象地域・補助率・上限額・申請期間・募集回次・公式URL`,
      inputSchema: DetailSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const url = `${JGRANTS_V2}/${params.subsidyId}`;
        const data = await fetchJson<JGrantsDetailResponse>(url);

        const s = data.result?.[0];
        if (!s) {
          return { content: [{ type: "text" as const, text: `ID: ${params.subsidyId} の補助金が見つかりませんでした。` }] };
        }

        const workflows = (s.workflow ?? []).map((w, i) =>
          `  第${i + 1}回: ${w.fiscal_year_round ?? ""} | 地域: ${w.target_area_search ?? "全国"}\n` +
          `    受付: ${w.acceptance_start_datetime?.slice(0, 10) ?? "?"} 〜 ${w.acceptance_end_datetime?.slice(0, 10) ?? "?"}`
        ).join("\n");

        const text = `📋 ${s.title}\n\n` +
          `${s.subsidy_catch_phrase ?? ""}\n\n` +
          `📝 概要:\n${s.detail ?? "記載なし"}\n\n` +
          `🎯 用途: ${s.use_purpose ?? "記載なし"}\n` +
          `🏭 業種: ${s.industry ?? "制限なし"}\n` +
          `📍 地域: ${s.target_area_detail ?? s.target_area_search ?? "全国"}\n` +
          `💰 補助率: ${s.subsidy_rate ?? "記載なし"} | 上限: ${s.subsidy_max_limit ? `${(s.subsidy_max_limit / 10000).toLocaleString()}万円` : "記載なし"}\n\n` +
          (workflows ? `📅 募集回次:\n${workflows}\n\n` : "") +
          (s.front_subsidy_detail_page_url ? `🔗 ${s.front_subsidy_detail_page_url}` : "");

        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `❌ jGrants 詳細取得エラー: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );
}
