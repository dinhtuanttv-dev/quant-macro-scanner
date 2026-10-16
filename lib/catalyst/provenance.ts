// lib/catalyst/provenance.ts — chỉ dữ liệu TRUY NGUỒN ĐƯỢC mới vào engine Chất xúc tác (rà soát 2026-10-16).
// Phát hiện: dữ liệu MẪU của scripts/seed-catalyst.ts (đã gỡ) — tin bịa "để phô diễn badge", chạy nhiều lần nên bị nhân bản —
// nằm trong DB production và hiển thị như xúc tác thật (VD VCB "Thong tu moi siet room tin dung…"), lại chiếm 15/47 mẫu của
// kiểm định X6. Mọi nguồn thật đều có dấu vết: originRecordId (tin RSS / HOSE / HNX / lịch vĩ mô) hoặc sourceUrl (CafeF).

import { isStockTicker, matchExchangeNegative } from "@/lib/ingestion/exchangeEventRules";

export interface ProvenanceFields {
  originRecordId?: string | null;
  sourceUrl?: string | null;
}

/** Nguồn thật = có bản ghi gốc hoặc URL nguồn. Dữ liệu mẫu không có cả hai. */
export function isTraceableSource(s: ProvenanceFields): boolean {
  return !!(s.originRecordId && s.originRecordId.trim()) || !!(s.sourceUrl && s.sourceUrl.trim());
}

/** Tiêu đề của dữ liệu mẫu đã gỡ (scripts/seed-catalyst.ts) — chỉ để làm sạch snapshot cũ còn lưu. */
export const DEMO_SEED_TITLES = new Set([
  "Tap doan thep trung goi thau ha tang 2,000 ty dong",
  "Luat Dat dai sua doi co hieu luc tu thang sau",
  "NHNN giu nguyen lai suat dieu hanh, ho tro thanh khoan he thong",
  "Thong tu moi siet room tin dung nhom ngan hang quoc doanh",
]);

/** Sự kiện quyền HOSE (GDKHQ, niêm yết bổ sung) — tin TRUNG LẬP (rawImpact 0), không phải xúc tác có hướng (X1). */
export function isNeutralCorporateEventTitle(title: string): boolean {
  return /giao dịch không hưởng quyền|niêm yết và giao dịch bổ sung|giao dịch bổ sung/i.test(title);
}

/** Ngày triển khai bộ lọc X1 + nguồn gốc; snapshot quét TRƯỚC ngày này cần làm sạch khi đọc. */
export const PROVENANCE_FIX_DATE = "2026-10-16T00:00:00Z";

interface CardLike { ticker: string; sourceTitle: string; direction?: string }
interface SectorLike { primaryCards: CardLike[]; cascadeCards: CardLike[] }
interface MoverLike { ticker: string; label: string }

/**
 * Làm sạch snapshot cũ (quét trước bản sửa) khi đọc: bỏ thẻ / mã tăng-giảm hạng đến từ dữ liệu mẫu hoặc tin trung lập.
 * KHÔNG tính lại điểm ngành (cần engine + DB) — trả `sanitized` để giao diện nói rõ cho tới lần quét kế tiếp.
 */
export function sanitizeLegacySnapshot<T extends { scannedAt: string; sectors?: SectorLike[]; upMovers?: MoverLike[]; downMovers?: MoverLike[] }>(snap: T): T & { sanitized?: { removedCards: number; removedMovers: number; reason: string } } {
  if (!snap?.scannedAt || snap.scannedAt >= PROVENANCE_FIX_DATE) return snap;
  const bad = (t: string) => DEMO_SEED_TITLES.has(t.trim()) || isNeutralCorporateEventTitle(t);
  // sự kiện tiêu cực của sở (bị kiểm soát / cảnh báo...) bị chấm "có lợi" trước bản sửa — sai chiều, ẩn đi
  const wrongBenefit = (t: string) => !!matchExchangeNegative(t);
  let removedCards = 0;
  const sectors = (snap.sectors ?? [])
    .map((s) => {
      const keep = (c: CardLike) => isStockTicker(c.ticker) && !bad(c.sourceTitle) && !(c.direction === "benefit" && wrongBenefit(c.sourceTitle));
      const primaryCards = s.primaryCards.filter(keep);
      const cascadeCards = s.cascadeCards.filter(keep);
      removedCards += s.primaryCards.length - primaryCards.length + s.cascadeCards.length - cascadeCards.length;
      return { ...s, primaryCards, cascadeCards };
    })
    .filter((s) => s.primaryCards.length + s.cascadeCards.length > 0);
  let removedMovers = 0;
  const clean = (list: MoverLike[] | undefined, benefitSide: boolean) => {
    const out = (list ?? []).filter((m) => isStockTicker(m.ticker) && !bad(m.label) && !(benefitSide && wrongBenefit(m.label)));
    removedMovers += (list?.length ?? 0) - out.length;
    return out;
  };
  const upMovers = clean(snap.upMovers, true);
  const downMovers = clean(snap.downMovers, false);
  if (!removedCards && !removedMovers) return snap;
  return {
    ...snap, sectors, upMovers, downMovers,
    sanitized: {
      removedCards, removedMovers,
      reason: "Đã ẩn các mục của lần quét cũ không đạt chuẩn: dữ liệu mẫu, tin trung lập (sự kiện quyền), sự kiện tiêu cực bị chấm nhầm “có lợi”, mã không phải cổ phiếu (VD HOSE); điểm ngành chưa được tính lại cho tới lần quét kế tiếp.",
    },
  };
}
