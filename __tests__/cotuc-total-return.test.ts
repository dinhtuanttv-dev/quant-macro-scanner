import { describe, expect, it } from "vitest";
import { buildTotalReturnSeries, crossCheckWithReference } from "@/lib/cotuc/timing-v3/total-return";

const nom = (pairs: [string, number][]) => pairs.map(([date, close]) => ({ date, close }));

describe("buildTotalReturnSeries — giá khớp danh nghĩa SSI + sự kiện quyền VCI", () => {
  it("cổ tức tiền mặt (VNM thật: GDKHQ 26/06/2026, 1.850đ, giá phiên trước 58.300): nắm qua GDKHQ chỉ còn thiệt phần thuế 5%", () => {
    const r = buildTotalReturnSeries(nom([["2026-06-24", 58_300], ["2026-06-25", 58_300], ["2026-06-26", 56_300], ["2026-06-29", 56_100]]),
      [{ exDate: "2026-06-26", valuePerShare: 1_850 }]);
    const f = 1 - (1_850 * 0.95) / 58_300;
    expect(r.applied).toEqual([expect.objectContaining({ exDate: "2026-06-26", kind: "CASH" })]);
    expect(r.bars[1].adjClose).toBeCloseTo(58_300 * f, 6);
    expect(r.bars[2].adjClose).toBe(56_300);
    expect(r.bars[3].adjClose).toBe(56_100);
    // Lợi suất ngày GDKHQ trên chuỗi điều chỉnh lùi (quy ước tái đầu tư cổ tức): 56.300 / (58.300 − 1.850×0,95) − 1
    // = biến động giá THẬT so với tham chiếu sau cổ tức — không còn "lỗ" giả bằng cả khoản cổ tức.
    expect(r.bars[2].adjClose / r.bars[1].adjClose - 1).toBeCloseTo(56_300 / (58_300 - 1_850 * 0.95) - 1, 10);
  });

  it("cổ tức cổ phiếu / thưởng: hệ số 1/(1+r) cộng dồn với cổ tức tiền mặt (FPT 2024: 132.800 -> thưởng 20%)", () => {
    const r = buildTotalReturnSeries(
      nom([["2024-06-10", 132_800], ["2024-06-11", 133_000], ["2024-06-12", 111_500], ["2024-12-01", 140_000], ["2024-12-02", 139_000]]),
      [{ exDate: "2024-12-02", valuePerShare: 1_000 }],
      [{ exDate: "2024-06-12", ratio: 0.2 }],
    );
    const fCash = 1 - (1_000 * 0.95) / 140_000;
    expect(r.bars[0].adjClose).toBeCloseTo(132_800 / 1.2 * fCash, 6);
    expect(r.bars[2].adjClose).toBeCloseTo(111_500 * fCash, 6);
    expect(r.bars[4].adjClose).toBe(139_000);
  });

  it("đợt ngoài phạm vi / bất thường bị bỏ qua có lý do; đối chiếu chéo với giá tham chiếu của Sở (quy về trước thuế)", () => {
    const r = buildTotalReturnSeries(nom([["2023-01-02", 80_000], ["2023-08-02", 79_000], ["2023-08-03", 76_500], ["2023-12-29", 70_000]]), [
      { exDate: "2023-08-03", valuePerShare: 2_500 }, { exDate: "2021-05-01", valuePerShare: 1_000 }, { exDate: "2023-12-29", valuePerShare: 60_000 },
    ]);
    expect(r.applied.map((a) => a.exDate)).toEqual(["2023-08-03"]);
    expect(r.skipped.map((s) => s.exDate).sort()).toEqual(["2021-05-01", "2023-12-29"]);
    const preTax = 1 - 2_500 / 79_000;
    expect(crossCheckWithReference(r.applied, [{ date: "2023-08-03", factor: Math.round(preTax * 1e4) / 1e4 }])).toEqual({ matched: 1, mismatched: [] });
    expect(crossCheckWithReference(r.applied, []).mismatched).toEqual([{ exDate: "2023-08-03", vci: Math.round(preTax * 1e4) / 1e4, ref: null }]);
  });
});
