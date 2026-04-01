// Health check endpoint
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({
    status: "ok",
    name: "skill60-mcp-server",
    version: "3.1.0",
    mode: "DATA_ONLY_NO_LLM",
    tools: 13,
    platform: "vercel",
  });
}
