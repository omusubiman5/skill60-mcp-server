// SKILL60+ MongoDB Atlas 接続 + エラーログ管理

import { MongoClient, Db, Collection } from "mongodb";

// 全ツール名の定数配列
const ALL_TOOLS = [
  "skill60_fetch_news",
  "skill60_search_jgrants",
  "skill60_jgrants_detail",
  "skill60_nenkin_news",
  "skill60_nenkin_page",
  "skill60_fetch_senior_sites",
  "skill60_scrape_url",
  "skill60_market_value",
  "skill60_health_info",
  "skill60_weather",
  "skill60_dialect_data",
  "skill60_text_to_speech",
] as const;

type ToolName = typeof ALL_TOOLS[number];

interface ErrorLog {
  tool: string;
  message: string;
  details?: unknown;
  timestamp: Date;
  level: "error" | "warn" | "info";
}

export interface ToolStatus {
  tool: string;
  status: "ok" | "error";
  lastError: string | null;
  errors24h: number;
  lastSuccess?: Date;
}

let client: MongoClient | null = null;
let db: Db | null = null;
let errorLogsCollection: Collection<ErrorLog> | null = null;

/**
 * MongoDB Atlas に接続
 * 失敗してもサーバーは落とさない（ログに警告）
 */
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("[DB] MONGODB_URI not set. Error logging disabled.");
    return;
  }

  try {
    client = new MongoClient(uri);
    await client.connect();

    db = client.db("skill60");
    errorLogsCollection = db.collection<ErrorLog>("error_logs");

    // インデックス作成（timestamp降順、tool）
    await errorLogsCollection.createIndex({ timestamp: -1 });
    await errorLogsCollection.createIndex({ tool: 1, timestamp: -1 });

    console.error("[DB] Connected to MongoDB Atlas (skill60 database)");
  } catch (e) {
    console.error("[DB] Failed to connect to MongoDB:", e instanceof Error ? e.message : String(e));
    console.warn("[DB] Server will continue without error logging.");
    client = null;
    db = null;
    errorLogsCollection = null;
  }
}

/**
 * エラーログを MongoDB に記録
 */
export async function logError(
  tool: string,
  message: string,
  details?: unknown,
  level: "error" | "warn" | "info" = "error"
): Promise<void> {
  // MongoDB未接続時はコンソールのみ
  console.error(`[${tool}] ${level.toUpperCase()}: ${message}`);

  if (!errorLogsCollection) return;

  try {
    await errorLogsCollection.insertOne({
      tool,
      message,
      details,
      timestamp: new Date(),
      level,
    });
  } catch (e) {
    // ログ記録失敗は無視（無限ループ防止）
    console.error("[DB] Failed to log error:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * 直近のエラーログを取得
 */
export async function getRecentErrors(limit: number = 50): Promise<ErrorLog[]> {
  if (!errorLogsCollection) return [];

  try {
    return await errorLogsCollection
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  } catch (e) {
    console.error("[DB] Failed to get recent errors:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * 全ツールの状態を集計
 */
export async function getToolStatus(): Promise<ToolStatus[]> {
  if (!errorLogsCollection) {
    // MongoDB未接続時は全ツールをokステータスで返す
    return ALL_TOOLS.map((tool) => ({
      tool,
      status: "ok" as const,
      lastError: null,
      errors24h: 0,
    }));
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const statuses: ToolStatus[] = [];

  for (const tool of ALL_TOOLS) {
    try {
      // 最新のエラー
      const latestError = await errorLogsCollection
        .findOne({ tool, level: "error" }, { sort: { timestamp: -1 } });

      // 24時間以内のエラー数
      const errorCount = await errorLogsCollection.countDocuments({
        tool,
        level: "error",
        timestamp: { $gte: oneDayAgo },
      });

      statuses.push({
        tool,
        status: errorCount > 0 ? "error" : "ok",
        lastError: latestError?.message || null,
        errors24h: errorCount,
      });
    } catch (e) {
      console.error(`[DB] Failed to get status for ${tool}:`, e instanceof Error ? e.message : String(e));
      statuses.push({
        tool,
        status: "ok",
        lastError: null,
        errors24h: 0,
      });
    }
  }

  return statuses;
}

/**
 * データベース接続を閉じる
 */
export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    errorLogsCollection = null;
    console.error("[DB] Connection closed");
  }
}
