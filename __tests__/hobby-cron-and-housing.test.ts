import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planHousingWrites, quarterRank } from "@/lib/commodity/housing-writes";

// Vercel Hobby: cron tối đa 1 lần/ngày, có thể chạy BẤT KỲ lúc nào trong giờ đã hẹn (±59 phút).
// Các bước phụ thuộc nhau phải nằm ở GIỜ KHÁC NHAU và đúng thứ tự, nếu không bước sau có thể chạy trước bước trước.
const crons: { path: string; schedule: string }[] = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")).crons;
const hourOf = (path: string) => {
  const c = crons.find((x) => x.path === path);
  if (!c) throw new Error(`thiếu cron ${path}`);
  return Number(c.schedule.split(" ")[1]);
};

describe("Lịch cron hợp lệ trên Vercel Hobby", () => {
  it("mọi cron chạy tối đa 1 lần/ngày: phút và giờ là số cố định", () => {
    for (const c of crons) {
      const [min, hour] = c.schedule.split(" ");
      expect(min, c.path).toMatch(/^\d{1,2}$/);
      expect(hour, c.path).toMatch(/^\d{1,2}$/);
    }
  });
  it("chuỗi cổ tức: mỗi bước một giờ riêng, đúng thứ tự", () => {
    const chain = ["dividend-universe-scan", "dividend-events-scan", "dividend-universe-score", "dividend-ai-analysis"].map((s) => hourOf(`/api/cron/${s}`));
    for (let i = 1; i < chain.length; i++) expect(chain[i]).toBeGreaterThan(chain[i - 1]);
  });
  it("siêu quét chạy ở giờ sau khi danh sách universe đã quét", () => {
    expect(hourOf("/api/cron/sieu-quet-scan")).toBeGreaterThan(hourOf("/api/cron/dividend-universe-scan"));
  });
  it("cron dữ liệu tần suất thấp (giá nhà BIS, cao su/urê World Bank) đã được bật lại, mỗi tuần", () => {
    const c = crons.find((x) => x.path === "/api/cron/refresh-lowfreq");
    expect(c?.schedule.split(" ")[4]).toMatch(/^[0-6]$/);
  });
});

describe("Kế hoạch ghi giá nhà BIS", () => {
  const pt = (countryCode: string, quarter: string) => ({ countryCode, countryName: countryCode, quarter, realIndexValue: 100, yoyChangePercent: 1 });
  it("so thứ tự quý; nhãn lạ coi như cũ nhất", () => {
    expect(quarterRank("2026-Q2")).toBeGreaterThan(quarterRank("2025-Q4"));
    expect(quarterRank("abc")).toBe(-1);
  });
  it("quý mới -> cập nhật; quý cũ/bằng -> không ghi; quốc gia mới -> thêm", () => {
    const p = planHousingWrites(
      [{ country_code: "US", quarter_label: "2025-Q4" }, { country_code: "JP", quarter_label: "2025-Q4" }, { country_code: "US", quarter_label: "2025-Q3" }],
      [pt("US", "2026-Q2"), pt("JP", "2025-Q4"), pt("VN", "2026-Q2")],
    );
    expect(p.updates.map((r) => r.country_code)).toEqual(["US"]);
    expect(p.inserts.map((r) => r.country_code)).toEqual(["VN"]);
    expect(p.unchanged).toBe(1);
    expect(p.updates[0]).toMatchObject({ quarter_label: "2026-Q2", source: "BIS (Bank for International Settlements)" });
  });
  it("chạy lại cùng dữ liệu không ghi gì (không trùng dòng)", () => {
    const p = planHousingWrites([{ country_code: "US", quarter_label: "2026-Q2" }], [pt("US", "2026-Q2")]);
    expect(p.updates.length + p.inserts.length).toBe(0);
  });
});
