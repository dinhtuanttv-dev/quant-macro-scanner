import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { detectSwingPoints, detectFvgZones, detectStructureEvents } from "@/lib/elite10/smc-detector";

// Elite 10 - SMC THAT (Giai doan 1: FVG + BOS/CHoCH), ROUTE HOAN TOAN
// MOI, KHONG dung chung/khong sua route /api/ta-vn-index/analyze dang
// hoat dong (mock SMC van giu nguyen o do). Frontend se GOI THEM route
// nay va chi thay phan SMC hien thi, khong dong vao cau truc component
// khac.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();

    const result = await fetchOhlcvHistory(ticker, "6mo");
    if (!result.success || !result.data || result.data.length < 20) {
      return NextResponse.json({ error: "Không đủ dữ liệu giá để phân tích SMC." }, { status: 500 });
    }

    const bars = result.data.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.adjClose }));
    const swings = detectSwingPoints(bars, 2);
    const fvgZones = detectFvgZones(bars);
    const structureEvents = detectStructureEvents(bars, swings);

    const unmitigatedFvg = fvgZones.filter((z) => !z.isMitigated);
    const recentEvents = structureEvents.slice(-5);
    const lastEvent = structureEvents[structureEvents.length - 1] ?? null;

    return NextResponse.json({
      ticker,
      generatedAt: new Date().toISOString(),
      dataSource: "Yahoo Finance adjClose (6 tháng gần nhất)",
      swingPointCount: swings.length,
      fvg: {
        total: fvgZones.length,
        unmitigated: unmitigatedFvg.length,
        zones: unmitigatedFvg.slice(-5), // 5 FVG chưa lấp gần nhất, đủ dùng cho hiển thị
      },
      structure: {
        totalEvents: structureEvents.length,
        recentEvents,
        currentBias: lastEvent?.direction ?? null,
        lastEventType: lastEvent?.type ?? null,
      },
      methodologyNote: "FVG: mẫu hình 3 nến (wick nến 1/nến 3 không chồng lấp). BOS/CHoCH: dựa trên swing high/low fractal N=2. Đây là định nghĩa cấu trúc giá khách quan, không phải khẳng định về ý đồ 'dòng tiền thông minh' — xem báo cáo rà soát để biết giới hạn phương pháp luận.",
    });
  } catch (err) {
    console.error("[api/elite10/smc] Lỗi:", err);
    return NextResponse.json({ error: "Không thể phân tích SMC lúc này." }, { status: 500 });
  }
}
