import { describe, expect, it } from "vitest";
import { directionOf, GRAPH_RETENTION_DAYS, mergeGraph, radarEventsToGraph, reviveGraph, type RadarEventLike } from "@/lib/catalyst/radarIngestion";
import { CatalystEngine } from "@/lib/catalyst/CatalystEngine";

const ev = (o: Partial<RadarEventLike>): RadarEventLike => ({
  eventId: "e1", title: "FPT báo lãi ròng quý 3 tăng mạnh", url: "https://vietstock.vn/a", publishedAt: "2026-10-30T02:00:00Z", firstSeenAt: "2026-10-30T02:05:00Z",
  eventType: "EARNINGS", sentiment: 0.67, severityScore: 2, sourceAuthority: "editorial_media", corroborationCount: 1, tickers: ["FPT", "VCB"], titleTickers: ["FPT"], ...o,
});

describe("Chiều tác động", () => {
  it("chính sách nới lỏng là tích cực dù có chữ 'giảm'; siết là tiêu cực; hai chiều hoặc trung lập -> không đoán", () => {
    expect(directionOf("Thêm nhiều ngân hàng giảm lãi suất", -0.33)).toBe("benefit");
    expect(directionOf("Xem xét giảm thuế tiêu thụ đặc biệt với xăng", null)).toBe("benefit");
    expect(directionOf("NHNN siết room tín dụng", 0.5)).toBe("harm");
    expect(directionOf("Giảm lãi suất nhưng tăng thuế", 0)).toBeNull();
    expect(directionOf("Kết quả kinh doanh quý 3", 0.1)).toBeNull();
    expect(directionOf("Kết quả kinh doanh quý 3", 0.67)).toBe("benefit");
    expect(directionOf("Kết quả kinh doanh quý 3", -0.67)).toBe("harm");
  });
});

describe("KQKD và giao dịch nội bộ theo tiêu đề (tiêu đề thật 29–30/10/2026)", () => {
  it("KQKD: không bị chữ 'giảm' đánh lừa; bài tổng hợp là trung lập", () => {
    expect(directionOf("Giảm dự phòng rủi ro, BIDV tăng 39% lợi nhuận trước thuế", -0.67, "EARNINGS")).toBe("benefit");
    expect(directionOf("REE báo lãi quý 3 tăng 17% nhờ mảng cơ điện lạnh", 0.67, "EARNINGS")).toBe("benefit");
    expect(directionOf("Công ty X lợi nhuận giảm 30% so với cùng kỳ", 0.2, "EARNINGS")).toBe("harm");
    expect(directionOf("Công ty Y báo lỗ 50 tỷ đồng quý 3", 0, "EARNINGS")).toBe("harm");
    expect(directionOf("Công ty Z giảm lỗ mạnh trong quý 3", -0.3, "EARNINGS")).toBe("benefit");
    expect(directionOf("Cập nhật lợi nhuận 18 ngân hàng đến sáng 29/10", 0.67, "EARNINGS")).toBeNull();
  });
  it("Xếp hạng theo chiều nâng/hạ; pháp lý chỉ tiêu cực khi có chế tài thật", () => {
    expect(directionOf("Fitch nâng xếp hạng tín nhiệm của Techcombank lên BB", -0.5, "RATING")).toBe("benefit");
    expect(directionOf("Moody's hạ xếp hạng ngân hàng X", 0.5, "RATING")).toBe("harm");
    expect(directionOf("Khởi tố Tổng giám đốc Tổng công ty Khoáng sản TKV", 0, "LEGAL")).toBe("harm");
    expect(directionOf("ACB cảnh báo nguy cơ mã độc trên iPhone", -0.67, "LEGAL")).toBeNull();
  });
  it("Nội bộ: mua tích cực, bán tiêu cực, không rõ thì trung lập", () => {
    expect(directionOf("BCB: Kế toán trưởng đăng ký bán 10.000 cổ phiếu", 0, "INSIDER")).toBe("harm");
    expect(directionOf("ABC: Chủ tịch đăng ký mua 1 triệu cổ phiếu", 0, "INSIDER")).toBe("benefit");
    expect(directionOf("CAR: Báo cáo thay đổi sở hữu cổ phiếu của cổ đông lớn", 0.67, "INSIDER")).toBeNull();
  });
});

describe("Sự kiện Radar -> đồ thị tác động", () => {
  it("bài nêu quá 3 mã không gán cho từng mã", () => {
    expect(radarEventsToGraph([ev({ titleTickers: ["VCB", "BID", "CTG", "MBB"], title: "Lợi nhuận ngân hàng tăng mạnh" })]).sources).toEqual([]);
  });
  it("chỉ mã trong tiêu đề; một báo đơn lẻ là rumor, từ 2 nguồn là confirmed; có ngành suy từ mã bước 2", () => {
    const g = radarEventsToGraph([ev({})], (t) => (t === "FPT" ? "Cong nghe" : null));
    expect(g.sources[0]).toMatchObject({ id: "e1", category: "earnings", sourceCredibility: "rumor", sourceUrl: "https://vietstock.vn/a" });
    expect(g.edges.filter((e) => e.targetType === "ticker").map((e) => e.targetId)).toEqual(["FPT"]);
    expect(g.edges.find((e) => e.targetType === "sector" && e.targetId === "Cong nghe")).toMatchObject({ hopCount: 2, propagationDistance: "downstream", direction: "benefit" });
    expect(radarEventsToGraph([ev({ corroborationCount: 2 })]).sources[0].sourceCredibility).toBe("confirmed");
  });
  it("công bố gắn mã dùng mã nguồn gắn và là confirmed", () => {
    const g = radarEventsToGraph([ev({ sourceAuthority: "disclosure_tagged_aggregator", titleTickers: [], tickers: ["HPG"] })]);
    expect(g.sources[0].sourceCredibility).toBe("confirmed");
    expect(g.edges.map((e) => e.targetId)).toEqual(["HPG"]);
  });
  it("bỏ: tin trung lập, loại không phải chất xúc tác (cổ tức, nhân sự…), tin doanh nghiệp không có mã, tin vĩ mô không chỉ ra được ngành/mã", () => {
    const g = radarEventsToGraph([
      ev({ eventId: "a", eventType: "CONTRACT", title: "FPT ký hợp đồng mới", sentiment: 0 }), ev({ eventId: "b", eventType: "DIVIDEND" }), ev({ eventId: "c", eventType: "PERSONNEL" }),
      ev({ eventId: "d", titleTickers: [] }), ev({ eventId: "e", eventType: "MACRO_NEWS", title: "Việt Nam và Ba Lan đạt thành tựu tích cực", titleTickers: [] }),
    ]);
    expect(g.sources).toEqual([]);
    expect(g.stats.skippedCount).toBe(5);
  });
  it("trọng số trong [1,10]; tin vĩ mô có ngành tạo cạnh ngành trực tiếp", () => {
    const g = radarEventsToGraph([ev({ eventType: "MONETARY_POLICY", title: "Các ngân hàng giảm lãi suất cho vay", titleTickers: [], severityScore: 3, sentiment: 0 })]);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.edges[0]).toMatchObject({ targetType: "sector", hopCount: 1, direction: "benefit" });
    expect(g.edges.every((e) => e.baseWeight >= 1 && e.baseWeight <= 10)).toBe(true);
  });
});

describe("Lưu đồ thị", () => {
  it("JSON -> Date; gộp theo id; bỏ tin quá hạn và cạnh mồ côi; quét lại cùng tin không nhân đôi", () => {
    const now = Date.parse("2026-10-31T00:00:00Z");
    const a = radarEventsToGraph([ev({})]);
    const once = reviveGraph(JSON.parse(JSON.stringify(mergeGraph({ sources: [], edges: [] }, a, now))));
    expect(once.sources[0].publishedDate).toBeInstanceOf(Date);
    const twice = mergeGraph(once, a, now);
    expect(twice.sources).toHaveLength(1);
    expect(twice.edges).toHaveLength(a.edges.length);
    const later = now + (GRAPH_RETENTION_DAYS + 2) * 86_400_000;
    expect(mergeGraph(twice, { sources: [], edges: [] }, later)).toEqual({ sources: [], edges: [] });
  });
  it("engine chấm được đồ thị từ Radar: mã có chiều và điểm", () => {
    const g = radarEventsToGraph([ev({ corroborationCount: 2, publishedAt: new Date().toISOString() })], () => "Cong nghe");
    const engine = new CatalystEngine(g.sources, g.edges, new Map(), []);
    expect(engine.getImpactForTickers(["FPT", "VCB"]).FPT.direction).toBe("benefit");
    expect(engine.getImpactForTickers(["FPT", "VCB"]).VCB.direction).toBe("none");
    expect(engine.getSectorRankings().map((s) => s.sector)).toContain("Cong nghe");
  });
});
