import { NextResponse } from "next/server";
import { fetchIntradayBars } from "@/lib/market-data/vndirect-adapter";

import { withCdnCache } from "@/lib/http/cdnCache";
export const maxDuration = 15;

function getVnDateKey(unixSec: number): string {
  const vnMs = unixSec * 1000 + 7 * 60 * 60 * 1000;
  return new Date(vnMs).toISOString().slice(0, 10);
}

async function getUncached() {
  try {
    const bars = await fetchIntradayBars("VNINDEX", 3, "15");
    if (bars.length === 0) {
      return NextResponse.json({ error: "Khong lay duoc du lieu intraday." }, { status: 502 });
    }

    const todayKey = getVnDateKey(bars[bars.length - 1].timestamp);
    const todayBars = bars.filter((b) => getVnDateKey(b.timestamp) === todayKey);

    const totalVolume = todayBars.reduce((sum, b) => sum + (b.volume ?? 0), 0);
    const AVG_MARKET_PRICE_VND = 35000;
    const estimatedValueBillionVnd = (totalVolume * AVG_MARKET_PRICE_VND) / 1_000_000_000;

    return NextResponse.json({
      date: todayKey,
      totalVolumeShares: totalVolume,
      estimatedValueBillionVnd: Math.round(estimatedValueBillionVnd),
      methodology: "UOC TINH: Tong khoi luong khop lenh x gia binh quan thi truong gia dinh (35,000 VND/CP). KHONG phai so lieu GTGD chinh thuc tu HOSE.",
      isEstimated: true,
    });
  } catch (err) {
    console.error("[api/market-data/vnindex-value-estimate] Loi:", err);
    return NextResponse.json({ error: "Khong uoc tinh duoc GTGD." }, { status: 500 });
  }
}

/** CDN của Vercel trả lượt gọi lặp lại trong 300 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 300);
