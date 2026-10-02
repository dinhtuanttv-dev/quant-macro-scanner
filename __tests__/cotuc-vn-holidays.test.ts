import { describe, expect, it } from "vitest";
import { tradingDaysBetween } from "@/lib/cotuc/timing-v3/date-utils";
import { vnHolidayCalendar } from "@/lib/cotuc/timing-v3/vn-holidays";

describe("lich nghi le VN cho dem ngay tuong lai (cron timing-signals-scan)", () => {
  it("dip 2/9/2026: 28/08 -> 03/09 chi con 1 phien (khong phai 4 nhu lich chi tru T7/CN)", () => {
    expect(tradingDaysBetween("2026-08-28", "2026-09-03", vnHolidayCalendar)).toBe(1);
  });
  it("Tet 2026: 13/02 -> 23/02 chi con 1 phien", () => {
    expect(tradingDaysBetween("2026-02-13", "2026-02-23", vnHolidayCalendar)).toBe(1);
  });
});
