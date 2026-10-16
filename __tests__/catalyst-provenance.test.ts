import { describe, expect, it } from "vitest";
import { isNeutralCorporateEventTitle, isTraceableSource, sanitizeLegacySnapshot } from "@/lib/catalyst/provenance";

const card = (ticker: string, sourceTitle: string) => ({ ticker, sourceTitle });

describe("nguồn gốc xúc tác", () => {
  it("chỉ nguồn có bản ghi gốc hoặc URL mới là thật; dữ liệu mẫu (không có cả hai) bị loại", () => {
    expect(isTraceableSource({ originRecordId: "hose-event-1-KDH" })).toBe(true);
    expect(isTraceableSource({ sourceUrl: "https://cafef.vn/x" })).toBe(true);
    expect(isTraceableSource({ originRecordId: null, sourceUrl: null })).toBe(false);
    expect(isTraceableSource({ originRecordId: "  " })).toBe(false);
  });

  it("nhận diện tin trung lập sự kiện quyền", () => {
    expect(isNeutralCorporateEventTitle("KDH giao dịch không hưởng quyền - trả cổ tức năm 2025 bằng cổ phiếu")).toBe(true);
    expect(isNeutralCorporateEventTitle("PNJ niêm yết và giao dịch bổ sung 1.003.678 cp")).toBe(true);
    expect(isNeutralCorporateEventTitle("NKG: Khuyến nghị MUA với giá mục tiêu 14,400")).toBe(false);
  });

  it("snapshot cũ: ẩn thẻ + mã tăng/giảm hạng từ dữ liệu mẫu và tin trung lập, bỏ ngành rỗng, ghi rõ lý do; snapshot mới giữ nguyên", () => {
    const old = {
      scannedAt: "2026-10-10T22:56:00Z",
      sectors: [
        { sector: "Ngan hang", primaryCards: [card("VCB", "Thong tu moi siet room tin dung nhom ngan hang quoc doanh")], cascadeCards: [] },
        { sector: "Thep", primaryCards: [card("NKG", "NKG: Khuyến nghị MUA với giá mục tiêu 14,400 đồng/cổ phiếu"), card("HPG", "Tap doan thep trung goi thau ha tang 2,000 ty dong")], cascadeCards: [] },
      ],
      upMovers: [{ ticker: "KDH", label: "KDH giao dịch không hưởng quyền - trả cổ tức" }, { ticker: "NKG", label: "NKG: Khuyến nghị MUA" }],
      downMovers: [{ ticker: "VCB", label: "Thong tu moi siet room tin dung nhom ngan hang quoc doanh" }],
    };
    const s = sanitizeLegacySnapshot(old);
    expect(s.sectors!.map((x) => x.sector)).toEqual(["Thep"]);
    expect(s.sectors![0].primaryCards.map((c) => c.ticker)).toEqual(["NKG"]);
    expect(s.upMovers!.map((m) => m.ticker)).toEqual(["NKG"]);
    expect(s.downMovers).toEqual([]);
    expect(s.sanitized).toMatchObject({ removedCards: 2, removedMovers: 2 });
    const fresh = { ...old, scannedAt: "2026-10-17T22:56:00Z" };
    expect(sanitizeLegacySnapshot(fresh)).toBe(fresh);
  });
});
