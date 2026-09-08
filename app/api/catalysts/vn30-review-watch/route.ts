import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { checkVn30ReviewAnnouncement } from "@/lib/domestic-events/gemini-monitor/vn30-review-watcher";

export const maxDuration = 30;

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
const RESULT_KEY = "catalyst:vn30-review-watch";

// Chay dinh ky (1 lan/tuan la du) - dung Gemini + Google Search grounding de
// PHAT HIEN neu HOSE da chinh thuc cong bo ngay ra soat VN30 ky tiep theo.
// CHI ghi vao Redis neu tim thay nguon THAT (da kiem tra trong watcher.ts).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const finding = await checkVn30ReviewAnnouncement();

    if (finding.found) {
      await redis.set(RESULT_KEY, {
        ...finding,
        checkedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, found: finding.found, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[api/catalysts/vn30-review-watch] Loi:", err);
    return NextResponse.json({ error: "Khong kiem tra duoc thong bao VN30." }, { status: 500 });
  }
}
