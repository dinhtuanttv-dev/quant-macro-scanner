import { describe, expect, it, vi } from "vitest";
import { buildCotucUniverse, getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { vndEventsToVciShape, fetchVndEventsVciShapeBulk } from "@/lib/cotuc/vndirect-finfo-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { appendIntradayBar } from "@/lib/cotuc/timing-v3/intraday";
import { vnHolidayCalendar } from "@/lib/cotuc/timing-v3/vn-holidays";
import { toDayNumber } from "@/lib/cotuc/timing-v3/date-utils";

// Mẫu sự kiện VNDirect THẬT (FPT, HPG — tra cứu 03/10/2026).
const RAW = [
  { code: "FPT", type: "KINDDIV", effectiveDate: "2026-09-21", ratio: 10, typeDesc: "Cổ phiếu thưởng", note: "Tỷ lệ 100:10", disclosureDate: "2026-09-05", locale: "VN" },
  { code: "FPT", type: "DIVIDEND", effectiveDate: "2026-05-28", actualDate: "2026-06-10", dividend: 1000, ratio: 10, note: "Trả cổ tức đợt 2/2025 (1000 đ/cp)", disclosureDate: "2026-05-12", locale: "VN" },
  { code: "FPT", type: "DIVIDEND", effectiveDate: "2026-05-28", actualDate: "2026-06-10", dividend: 1000, ratio: 10, locale: "EN_GB" },
  { code: "FPT", type: "MEETING", effectiveDate: "2026-03-26", note: "ĐHĐCĐ thường niên năm 2026", disclosureDate: "2026-02-20", locale: "VN" },
  { code: "HPG", type: "STOCKDIV", effectiveDate: "2026-05-25", ratio: 10, typeDesc: "Cổ tức bằng cổ phiếu", note: "Trả cổ tức năm 2025, tỷ lệ 100:10", locale: "VN" },
  { code: "HPG", type: "LISTED", effectiveDate: "2026-06-01", locale: "VN" },
];

describe("VNDirect -> định dạng VCI", () => {
  it("map DIVIDEND/KINDDIV/STOCKDIV/MEETING, bỏ bản EN_GB và loại không liên quan", () => {
    const ev = vndEventsToVciShape(RAW.filter((r) => r.code === "FPT"));
    expect(ev.map((e) => e.eventCode)).toEqual(["ISS", "DIV", "AGME"]);
    const div = ev.find((e) => e.eventCode === "DIV")!;
    expect(div).toMatchObject({ exrightDate: "2026-05-28", payoutDate: "2026-06-10", valuePerShare: 1000, publicDate: "2026-05-12" });
    expect(ev.find((e) => e.eventCode === "AGME")!.issueDate).toBe("2026-03-26");
    expect(vndEventsToVciShape(RAW.filter((r) => r.code === "HPG"))).toHaveLength(1);
  });

  it("buildLifecycleEvents phân loại đúng (CASH / BONUS_ISSUE / STOCK_DIVIDEND) và gắn ĐHCĐ", () => {
    const fpt = buildLifecycleEvents("FPT", vndEventsToVciShape(RAW.filter((r) => r.code === "FPT")));
    expect(fpt.map((e) => e.eventType).sort()).toEqual(["BONUS_ISSUE", "CASH"]);
    expect(fpt.find((e) => e.eventType === "CASH")!.agmDate).toBe("2026-03-26");
    expect(fpt.find((e) => e.eventType === "BONUS_ISSUE")!.exerciseRatio).toBeCloseTo(0.1, 10);
    const hpg = buildLifecycleEvents("HPG", vndEventsToVciShape(RAW.filter((r) => r.code === "HPG")));
    expect(hpg[0].eventType).toBe("STOCK_DIVIDEND");
  });

  it("bulk: một request cho nhiều mã, mã không có sự kiện vẫn có mặt", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: RAW }), { status: 200 })) as unknown as typeof fetch;
    const r = await fetchVndEventsVciShapeBulk(["FPT", "HPG", "ZZZ"], "2021-01-01", "2027-04-01", { fetchImpl });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
    expect(r.byTicker.get("FPT")).toHaveLength(3);
    expect(r.byTicker.get("ZZZ")).toEqual([]);
  });
});

describe("danh mục quét = danh mục Siêu Quét", () => {
  it("17 mã gốc đứng đầu, phần còn lại theo GTGD giảm dần, ngành có dấu", () => {
    const u = buildCotucUniverse([
      { ticker: "VIC", sector: "Bat dong san", industry: "Bất động sản", avgValue20: 1e12 },
      { ticker: "SSI", industry: "Chứng khoán", avgValue20: 5e11 },
      { ticker: "FPT", industry: "Công nghệ", avgValue20: 4e11 },
      { ticker: "bad ticker!" },
    ]);
    expect(u.slice(0, 17).every((t) => t.core)).toBe(true);
    expect(u.slice(17).map((t) => t.ticker)).toEqual(["VIC", "SSI"]);
    expect(u.find((t) => t.ticker === "VIC")!.sector).toBe("Bất động sản");
    expect(u.find((t) => t.ticker === "FPT")!.sector).toBe("Công nghệ TT"); // giữ ngành gốc của 17 mã
  });
  it("Gateway lỗi -> 17 mã gốc", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    const u = await getCotucUniverse({ fetchImpl, force: true });
    expect(u.source).toBe("FALLBACK_17");
    expect(u.tickers).toHaveLength(17);
  });
});

describe("giá trong phiên + lịch nghỉ 2027", () => {
  const s = [{ date: "2026-10-01", adjClose: 100 }, { date: "2026-10-02", adjClose: 101 }];
  it("thêm phiên mới, thay phiên trùng ngày, bỏ qua giá cũ/hỏng", () => {
    expect(appendIntradayBar(s, { price: 103, date: "2026-10-05" }).at(-1)).toEqual({ date: "2026-10-05", adjClose: 103 });
    expect(appendIntradayBar(s, { price: 102, date: "2026-10-02" })).toHaveLength(2);
    expect(appendIntradayBar(s, { price: 102, date: "2026-10-02" }).at(-1)!.adjClose).toBe(102);
    expect(appendIntradayBar(s, { price: 99, date: "2026-09-30" })).toBe(s);
    expect(appendIntradayBar(s, { price: 0, date: "2026-10-05" })).toBe(s);
  });
  it("01/01, 30/04, nghỉ bù 03/05 và 02/09/2027 không phải ngày giao dịch", () => {
    for (const d of ["2027-01-01", "2027-04-30", "2027-05-03", "2027-09-02"]) expect(vnHolidayCalendar.isTradingDay(toDayNumber(d)!)).toBe(false);
    expect(vnHolidayCalendar.isTradingDay(toDayNumber("2027-05-04")!)).toBe(true);
  });
});
