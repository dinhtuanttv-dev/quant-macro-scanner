import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchVietnamMarketScan } from "@/lib/sieu-quet-ai/tradingview-scanner";
import { rankTop200 } from "@/lib/sieu-quet-ai/top200-ranking";

// SIEU QUET AI - Dong bo Top 200 Universe tu TradingView Scanner API
// (cong khai, khong chinh thuc - da xac nhan hoat dong thuc te, doi
// chieu VIC/VHM khop chinh xac voi Yahoo/VNDirect). Chay 1 LAN/TUAN
// (thanh phan Top 200 it doi hang ngay, khac Cron Job tinh diem chinh
// chay hang ngay).
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scanResult = await fetchVietnamMarketScan();
    if (!scanResult.success) {
      return NextResponse.json({ error: `Không lấy được dữ liệu TradingView: ${scanResult.error}` }, { status: 500 });
    }

    const ranked = rankTop200(scanResult.data, 200);
    if (ranked.length === 0) {
      return NextResponse.json({ error: "Không có mã nào đạt điều kiện lọc." }, { status: 500 });
    }

    // Xoa danh sach cu, ghi danh sach moi (danh sach Top 200 thay doi
    // theo thoi gian - khong upsert tung dong vi ranking co the doi thu tu)
    await prisma.$transaction([
      prisma.sieuQuetUniverseTicker.deleteMany({}),
      prisma.sieuQuetUniverseTicker.createMany({
        data: ranked.map((r) => ({
          ticker: r.ticker, name: r.name, exchange: r.exchange, sector: r.sector,
          marketCap: r.marketCap, volume: r.volume, score: r.score, rank: r.rank,
        })),
      }),
    ]);

    return NextResponse.json({ syncedAt: new Date().toISOString(), totalTickers: ranked.length });
  } catch (err) {
    console.error("[cron/sieu-quet-universe-sync] Lỗi:", err);
    return NextResponse.json({ error: "Không thể đồng bộ Top 200 Universe lúc này." }, { status: 500 });
  }
}
