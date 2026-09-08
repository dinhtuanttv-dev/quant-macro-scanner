import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

// Doc ket qua giam sat gan nhat - route nay KHONG can CRON_SECRET vi chi
// doc du lieu, khong ton phi Gemini.
export async function GET() {
  try {
    const result = await redis.get("catalyst:vn30-review-watch");
    return NextResponse.json({ finding: result ?? null });
  } catch (err) {
    console.error("[api/catalysts/vn30-review-latest] Loi:", err);
    return NextResponse.json({ error: "Khong doc duoc ket qua." }, { status: 500 });
  }
}
