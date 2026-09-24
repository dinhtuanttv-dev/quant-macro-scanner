import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Elite 10 - Muc A/B (Tech Spec v2) Giai doan 4/4: Cron chay Debate AI
// TU DONG cho mot so ma "Core" quan trong nhat (lay tu Danh Sach Ma da
// co san, status='core' = badge "Elite Convergence"). Chay 1 lan/ngay
// (Vercel Hobby CHI CHO PHEP toi da 1 lan/ngay - cron nhieu lan/ngay se
// bi TU CHOI ngay khi deploy, da xac nhan qua tra cuu truoc khi giao).
//
// maxDuration=300s (gioi han THAT SU toi da cua Hobby, khong phai 60s
// nhu gia dinh truoc do) - cho phep chay ~10 ma/lan (300s / ~25-30s
// moi debate). Ket hop voi viec doi model sang gemini-3.5-flash-lite
// (500 request/ngay, khong con la nut that quota nua), day la muc an
// toan va hop ly cho 1 lan chay/ngay tren Hobby.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CORE_TICKERS_PER_RUN = 10;

export async function GET(req: Request) {
  try {
    const { origin } = new URL(req.url);

    const watchlistRes = await fetch(`${origin}/api/elite10/watchlist?filter=core`, { cache: "no-store" });
    if (!watchlistRes.ok) {
      return NextResponse.json({ error: "Không lấy được danh sách mã Core." }, { status: 502 });
    }
    const coreItems: { ticker: string }[] = await watchlistRes.json();
    const allCoreTickers = coreItems.map((i) => i.ticker);

    // Bo qua ma DA CO debate HOAN TAT trong 24h gan nhat - de qua
    // nhieu lan chay cron trong ngay, uu tien ma CHUA duoc chay thay vi
    // chay lai lien tuc cung 1-3 ma dau danh sach.
    const recentlyDebated = await prisma.debateSession.findMany({
      where: {
        ticker: { in: allCoreTickers }, status: "completed",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { ticker: true },
    });
    const recentlyDebatedSet = new Set(recentlyDebated.map((r) => r.ticker));
    const pendingTickers = allCoreTickers.filter((t) => !recentlyDebatedSet.has(t));
    const tickers = pendingTickers.slice(0, MAX_CORE_TICKERS_PER_RUN);

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

    return NextResponse.json({ tickersProcessed: tickers, tickersSkippedAlreadyDone: [...recentlyDebatedSet], results });
  } catch (err) {
    console.error("[cron/run-core-debates] Lỗi:", err);
    return NextResponse.json({ error: "Không thể chạy cron Debate AI lúc này." }, { status: 500 });
  }
}
