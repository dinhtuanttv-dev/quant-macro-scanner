import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { checkSbvRateChangeAnnouncement } from "@/lib/domestic-events/gemini-monitor/sbv-rate-watcher";

export const maxDuration = 30;
const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
const RESULT_KEY = "catalyst:sbv-rate-watch";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const finding = await checkSbvRateChangeAnnouncement();
    if (finding.found) {
      await redis.set(RESULT_KEY, { ...finding, checkedAt: new Date().toISOString() });
    }
    return NextResponse.json({ ok: true, found: finding.found });
  } catch (err) {
    console.error("[api/catalysts/sbv-rate-watch] Loi:", err);
    return NextResponse.json({ error: "Khong kiem tra duoc thong bao SBV." }, { status: 500 });
  }
}
