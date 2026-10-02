import { describe, expect, it } from "vitest";
import { parseVndEvents, parseVndStatements } from "@/lib/cotuc/vndirect-finfo-adapter";
import { buildSeasonalitySamples } from "@/lib/cotuc/timing-v3/seasonality/seasonality-io";

describe("VNDirect finfo — sự kiện quyền & BCTC quý (dữ liệu thật đã đối chiếu)", () => {
  it("sự kiện: tiền mặt (đ/CP), cổ tức CP / thưởng (% -> tỷ lệ), họp ĐHCĐ; bỏ bản EN_GB trùng; 2 đợt cùng ngày GDKHQ được cộng", () => {
    const r = parseVndEvents([
      { type: "DIVIDEND", effectiveDate: "2026-06-26", dividend: 1850, ratio: 18.5, locale: "VN", note: "Trả cổ tức đợt 2/2025 (1850 đ/cp)" },
      { type: "DIVIDEND", effectiveDate: "2026-06-26", dividend: 1850, ratio: 18.5, locale: "EN_GB" },
      { type: "KINDDIV", effectiveDate: "2026-09-21", ratio: 10, locale: "VN" },
      { type: "STOCKDIV", effectiveDate: "2026-05-18", ratio: 15, locale: "VN" },
      { type: "DIVIDEND", effectiveDate: "2024-06-12", dividend: 1000, locale: "VN" },
      { type: "DIVIDEND", effectiveDate: "2024-06-12", dividend: 500, locale: "VN" },
      { type: "MEETING", effectiveDate: "2026-03-26", locale: "VN" },
      { type: "LISTED", effectiveDate: "2026-05-08", locale: "VN" },
    ]);
    expect(r.cash).toEqual([
      { exDate: "2024-06-12", valuePerShare: 1500, note: null },
      { exDate: "2026-06-26", valuePerShare: 1850, note: "Trả cổ tức đợt 2/2025 (1850 đ/cp)" },
    ]);
    expect(r.shares.map((x) => [x.exDate, x.ratio, x.kind])).toEqual([["2026-05-18", 0.15, "STOCKDIV"], ["2026-09-21", 0.1, "KINDDIV"]]);
    expect(r.meetings).toEqual(["2026-03-26"]);
  });

  it("BCTC: doanh thu + LNST mẹ theo quý, ngày công bố = ngày nhập sớm nhất trong 1–120 ngày sau cuối quý", () => {
    const q = parseVndStatements([
      { itemCode: 21001, numericValue: 18_847e9, fiscalDate: "2026-06-30", createdDate: "2026-07-30 00:00:00", reportType: "QUARTER" },
      { itemCode: 23000, numericValue: 3_167e9, fiscalDate: "2026-06-30", createdDate: "2026-08-17 00:00:00", reportType: "QUARTER" },
      { itemCode: 23000, numericValue: 2_124e9, fiscalDate: "2024-12-31", createdDate: "2025-01-24 00:00:00", reportType: "QUARTER" },
      { itemCode: 23000, numericValue: 1e9, fiscalDate: "2005-03-31", createdDate: "2016-01-01 00:00:00", reportType: "QUARTER" },
      { itemCode: 23000, numericValue: 9e9, fiscalDate: "2024-12-31", createdDate: "2025-02-20 00:00:00", reportType: "YEAR" },
    ]);
    expect(q[0]).toEqual({ year: 2026, quarter: 2, fiscalDate: "2026-06-30", announceDate: "2026-07-30", revenue: 18_847e9, netProfit: 3_167e9 });
    expect(q[1]).toMatchObject({ year: 2024, quarter: 4, announceDate: "2025-01-24", netProfit: 2_124e9 });
    expect(q[2]).toMatchObject({ year: 2005, quarter: 1, announceDate: null }); // ngày nạp hàng loạt -> không dùng
  });

  it("ngày công bố cuối tuần được dời sang phiên giao dịch kế tiếp (ngày 0 = phiên đầu tiên thị trường biết tin)", () => {
    const dates: string[] = [];
    const d = new Date(Date.UTC(2023, 0, 2));
    while (dates.length < 120) { if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    const prices = dates.map((date) => ({ date, adjClose: 100 }));
    const sat = "2023-04-29"; // thứ Bảy
    const r = buildSeasonalitySamples("TST", prices, prices, { 1: [sat], 2: [], 3: [], 4: [] }, "x");
    const ep = (r.paths["1"] as unknown as { eventPaths: { exDate: string }[] }).eventPaths;
    expect(ep[0].exDate).toBe("2023-05-01");
  });
});
