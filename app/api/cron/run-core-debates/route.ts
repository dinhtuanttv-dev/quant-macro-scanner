import { NextResponse } from "next/server";

// Elite 10 - Muc A/B (Tech Spec v2) Giai doan 4/4: Cron chay Debate AI
// TU DONG cho vai ma "Core" quan trong nhat (lay tu Danh Sach Ma da co
// san, status='core' = badge "Elite Convergence"). CHAY HANG NGAY, chi
// gioi han vai ma MOI LAN (khong phai toan bo watchlist) vi moi debate
// mat ~20-30s (3 luot + 2 judge = 5 lan goi Gemini tuan tu) - voi
// maxDuration=60s, CHI AN TOAN cho toi da ~2-3 ma/lan chay.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CORE_TICKERS_PER_RUN = 3;

export async function GET(req: Request) {
  try {
    const { origin } = new URL(req.url);

    const watchlistRes = await fetch(`${origin}/api/elite10/watchlist?filter=core`, { cache: "no-store" });
    if (!watchlistRes.ok) {
      return NextResponse.json({ error: "Không lấy được danh sách mã Core." }, { status: 502 });
    }
    const coreItems: { ticker: string }[] = await watchlistRes.json();
    const tickers = coreItems.slice(0, MAX_CORE_TICKERS_PER_RUN).map((i) => i.ticker);

    const results: { ticker: string; status: string }[] = [];
    // Chay TUAN TU (khong Promise.all) - tranh goi qua nhieu Gemini
    // request DONG THOI co the cham quota/rate-limit hon nua.
    for (const ticker of tickers) {
      try {
        const debateRes = await fetch(`${origin}/api/elite10/debate/${ticker}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggeredBy: "cron" }), cache: "no-store",
        });
        results.push({ ticker, status: debateRes.ok ? "completed" : "failed" });
      } catch {
        results.push({ ticker, status: "failed" });
      }
    }

    return NextResponse.json({ tickersProcessed: tickers, results });
  } catch (err) {
    console.error("[cron/run-core-debates] Lỗi:", err);
    return NextResponse.json({ error: "Không thể chạy cron Debate AI lúc này." }, { status: 500 });
  }
}
