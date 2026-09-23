import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { detectSwingPoints, detectFvgZones, detectStructureEvents, detectOrderBlocks, detectVsaSignals, detectWyckoffSchematic } from "@/lib/elite10/smc-detector";
import { backtestPattern } from "@/lib/elite10/pattern-backtest";

// Elite 10 - SMC THAT (Giai doan 1: FVG + BOS/CHoCH), ROUTE HOAN TOAN
// MOI, KHONG dung chung/khong sua route /api/ta-vn-index/analyze dang
// hoat dong (mock SMC van giu nguyen o do). Frontend se GOI THEM route
// nay va chi thay phan SMC hien thi, khong dong vao cau truc component
// khac.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();

    const result = await fetchOhlcvHistory(ticker, "2y");
    if (!result.success || !result.data || result.data.length < 20) {
      return NextResponse.json({ error: "Không đủ dữ liệu giá để phân tích SMC." }, { status: 500 });
    }

    const bars = result.data.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.adjClose, volume: b.volume }));
    const swings = detectSwingPoints(bars, 2);
    const fvgZones = detectFvgZones(bars);
    const structureEvents = detectStructureEvents(bars, swings);
    const orderBlocks = detectOrderBlocks(bars, structureEvents, 1.5);
    const vsaSignals = detectVsaSignals(bars, 20, 40);
    // NANG CAP DU LIEU (2026-09-23): bars gio la 2 nam (thay vi 6 thang)
    // de tang sample size cho backtest FVG/BOS/CHoCH/OrderBlock. RIENG
    // Wyckoff Schematic van CHI xet 6 thang GAN NHAT (bars.slice(-125))
    // - vi detectWyckoffSchematic tra ve schematic "TOT NHAT" tim thay
    // trong TOAN BO mang dua vao, neu dua ca 2 nam se co the tra ve 1
    // schematic TU RAT LAU (VD 18 thang truoc), mat tinh thoi su tren UI.
    const wyckoff = detectWyckoffSchematic(bars.slice(-125));

    // GIAI DOAN 4: backtest thong ke chat che (bootstrap CI90/winRate/
    // sampleSize tai dung 100% tu buildWindowStats co san trong
    // time-engine.ts) cho TUNG loai pattern, tach rieng bullish/bearish
    // vi 2 huong co y nghia khac nhau. Wyckoff KHONG backtest duoc o day
    // vi detectWyckoffSchematic() hien chi tra ve 1 schematic GAN NHAT
    // (khong phai toan bo lich su cac lan xay ra) - ghi ro trong
    // response, KHONG bia sample size.
    const barsForBacktest = bars.map((b) => ({ date: b.date, adjClose: b.close }));
    const holdDaysForBacktest = 10;
    const fvgBullBacktest = backtestPattern(barsForBacktest, fvgZones.filter((z) => z.direction === "bullish").map((z) => ({ date: z.endDate, direction: "bullish" as const })), "FVG tăng", holdDaysForBacktest);
    const fvgBearBacktest = backtestPattern(barsForBacktest, fvgZones.filter((z) => z.direction === "bearish").map((z) => ({ date: z.endDate, direction: "bearish" as const })), "FVG giảm", holdDaysForBacktest);
    const bosBullBacktest = backtestPattern(barsForBacktest, structureEvents.filter((e) => e.type === "BOS" && e.direction === "bullish").map((e) => ({ date: e.date, direction: "bullish" as const })), "BOS tăng", holdDaysForBacktest);
    const bosBearBacktest = backtestPattern(barsForBacktest, structureEvents.filter((e) => e.type === "BOS" && e.direction === "bearish").map((e) => ({ date: e.date, direction: "bearish" as const })), "BOS giảm", holdDaysForBacktest);
    const chochBullBacktest = backtestPattern(barsForBacktest, structureEvents.filter((e) => e.type === "CHoCH" && e.direction === "bullish").map((e) => ({ date: e.date, direction: "bullish" as const })), "CHoCH tăng", holdDaysForBacktest);
    const chochBearBacktest = backtestPattern(barsForBacktest, structureEvents.filter((e) => e.type === "CHoCH" && e.direction === "bearish").map((e) => ({ date: e.date, direction: "bearish" as const })), "CHoCH giảm", holdDaysForBacktest);
    const obBullBacktest = backtestPattern(barsForBacktest, orderBlocks.filter((z) => z.direction === "bullish").map((z) => ({ date: z.date, direction: "bullish" as const })), "Order Block tăng", holdDaysForBacktest);
    const obBearBacktest = backtestPattern(barsForBacktest, orderBlocks.filter((z) => z.direction === "bearish").map((z) => ({ date: z.date, direction: "bearish" as const })), "Order Block giảm", holdDaysForBacktest);

    const unmitigatedFvg = fvgZones.filter((z) => !z.isMitigated);
    const recentEvents = structureEvents.slice(-5);
    const lastEvent = structureEvents[structureEvents.length - 1] ?? null;

    return NextResponse.json({
      ticker,
      generatedAt: new Date().toISOString(),
      dataSource: "Yahoo Finance adjClose (2 năm gần nhất, riêng Wyckoff Schematic chỉ xét 6 tháng gần nhất để giữ tính thời sự)",
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
      orderBlocks: {
        total: orderBlocks.length,
        zones: orderBlocks.slice(-3), // 3 Order Block gần nhất
      },
      vsa: {
        recentSignals: vsaSignals.slice(-3), // 3 tín hiệu VSA gần nhất
        lastSignal: vsaSignals[vsaSignals.length - 1] ?? null,
      },
      wyckoff,
      backtest: {
        holdDays: holdDaysForBacktest,
        fvgBullish: fvgBullBacktest, fvgBearish: fvgBearBacktest,
        bosBullish: bosBullBacktest, bosBearish: bosBearBacktest,
        chochBullish: chochBullBacktest, chochBearish: chochBearBacktest,
        orderBlockBullish: obBullBacktest, orderBlockBearish: obBearBacktest,
        wyckoffNote: "Chưa backtest được — bộ phát hiện Wyckoff hiện chỉ trả về 1 schematic gần nhất, chưa quét toàn bộ lịch sử các lần xảy ra để có đủ mẫu.",
      },
      methodologyNote: "FVG: mẫu hình 3 nến (wick nến 1/nến 3 không chồng lấp). BOS/CHoCH: dựa trên swing high/low fractal N=2. Order Block: nến đối nghịch cuối cùng trước 1 nến impulsive (range ≥ 1.5×ATR14) dẫn tới BOS/CHoCH. VSA No Demand/Supply: nến tăng/giảm có volume dưới percentile 40 (20 phiên gần nhất) và spread hẹp hơn trung bình. Wyckoff Spring/SOS/LPS: chỉ phát hiện 3 sự kiện có định nghĩa định lượng rõ ràng, KHÔNG phải toàn bộ chu kỳ Wyckoff A-E (giai đoạn PS/SC/AR/ST cần phán đoán chủ quan, không đưa vào để tránh dùng số liệu giả), chỉ xét 6 tháng gần nhất để giữ tính thời sự. Backtest (cả 2 phương pháp): tính trên dữ liệu 2 năm gần nhất (mở rộng từ 6 tháng để tăng cỡ mẫu) — mẫu vẫn có thể nhỏ với pattern hiếm gặp (<30), luôn kiểm tra cờ isLowSample/n<30 trước khi tin vào con số. Đây là định nghĩa cấu trúc giá khách quan, không phải khẳng định về ý đồ 'dòng tiền thông minh' — xem báo cáo rà soát để biết giới hạn phương pháp luận.",
    });
  } catch (err) {
    console.error("[api/elite10/smc] Lỗi:", err);
    return NextResponse.json({ error: "Không thể phân tích SMC lúc này." }, { status: 500 });
  }
}
