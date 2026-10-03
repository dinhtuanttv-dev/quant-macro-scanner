import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { tradingDaysBetween } from "@/lib/cotuc/timing-v3/date-utils";
import { vnHolidayCalendar, setGatewayHolidays } from "@/lib/cotuc/timing-v3/vn-holidays";
import { ruleHolidaySet, ruleHolidays, tetDate, hungKingsDate, makeVnTradingCalendar } from "@/lib/cotuc/timing-v3/vn-trading-calendar";

// Bo kiem chung DUNG CHUNG voi Market Gateway va global-quanta: ngay thuong khong co phien VN-Index that 2017–2026.
const OBSERVED: string[] = JSON.parse(readFileSync("__tests__/fixtures/vn-observed-holidays-2017-2026.json", "utf8")).holidays;
const UNPREDICTABLE = ["2018-01-23", "2018-01-24", "2018-12-31", "2019-04-29", "2024-04-29", "2025-05-02", "2026-01-02", "2026-08-31"];

afterEach(() => setGatewayHolidays(null));

describe("lịch nghỉ tự tính (không nạp tay)", () => {
  it("âm lịch: Tết/Giỗ Tổ đúng", () => {
    expect(tetDate(2026)).toBe("2026-02-17");
    expect(tetDate(2027)).toBe("2027-02-06");
    expect(hungKingsDate(2026)).toBe("2026-04-26");
  });
  it("quy tắc vs 10 năm phiên thật: 106/106, không đánh nhầm; chỉ sót ngày nghỉ nối", () => {
    const rule = [...ruleHolidaySet(2017, 2026).keys()].filter((d) => d <= "2026-10-02");
    expect(rule.filter((d) => !OBSERVED.includes(d))).toEqual([]);
    expect(OBSERVED.filter((d) => !rule.includes(d))).toEqual(UNPREDICTABLE);
    expect(rule).toHaveLength(106);
  });
  it("năm tương lai tính được, không cần cập nhật", () => {
    for (let y = 2027; y <= 2040; y++) expect(ruleHolidays(y).length).toBeGreaterThanOrEqual(9);
  });
});

describe("lich nghi le VN cho dem ngay tuong lai (cron timing-signals-scan)", () => {
  it("Tet 2026: 13/02 -> 23/02 chi con 1 phien (chi quy tac)", () => {
    expect(tradingDaysBetween("2026-02-13", "2026-02-23", vnHolidayCalendar)).toBe(1);
  });
  it("dip 2/9/2026: quy tac -> 2 phien; them lop Gateway (31/08 nghi noi) -> 1 phien", () => {
    expect(tradingDaysBetween("2026-08-28", "2026-09-03", vnHolidayCalendar)).toBe(2);
    setGatewayHolidays({ from: "2026-01-01", to: "2026-12-31", holidays: new Set(["2026-08-31", "2026-09-01", "2026-09-02"]) });
    expect(tradingDaysBetween("2026-08-28", "2026-09-03", vnHolidayCalendar)).toBe(1);
  });
  it("ngoai khoang Gateway da tra -> quy tac", () => {
    const cal = makeVnTradingCalendar({ from: "2026-01-01", to: "2026-12-31", holidays: new Set() });
    expect(cal.isHolidayIso("2026-02-17")).toBe(false); // Gateway noi khong nghi -> tin Gateway
    expect(cal.isHolidayIso("2027-02-05")).toBe(true); // ngoai khoang -> quy tac Tet 2027
  });
});
