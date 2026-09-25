// Giai Trinh Hoi Tu - Giai doan 2: sinh cau giai thich BANG NGON NGU TU
// NHIEN cho tung pillar, tu METADATA THAT da co san (KHONG bia) - day
// la yeu cau cot loi cua nguoi dung: "khi dien giai tich hop cac tab
// phai dien giai day du vi sao duoc tich hop", VD "thuan xu huong
// uptrend, nuoc ngoai mua rong" hoac "FPT - Cong nghe/Ban dan - Nganh
// Cong nghe/Ban dan Chau A +1.15%".
//
// Nguyen tac: CHI dung field THAT co gia tri (khac null/undefined) -
// neu thieu du lieu cho 1 phan cau, BO QUA phan do (khong dien "chua
// co du lieu" giua cau, tranh cau van cung nhac).

const QUADRANT_LABEL_VI: Record<string, string> = {
  Leading: "dẫn dắt", Improving: "cải thiện", Weakening: "suy yếu", Lagging: "tụt hậu",
};

export function generateCoreReasonText(meta: { trendTag?: string | null; foreignNetBuyFlag?: boolean; confluenceStatus?: string | null }): string | null {
  const parts: string[] = [];
  if (meta.trendTag) parts.push(`thuận xu hướng ${meta.trendTag}`);
  if (meta.foreignNetBuyFlag) parts.push("khối ngoại mua ròng mạnh (Top 5 HOSE hôm nay)");
  if (meta.confluenceStatus) parts.push(meta.confluenceStatus);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function generateTaReasonText(meta: { rsRating?: number | null }): string | null {
  if (meta.rsRating === null || meta.rsRating === undefined) return null;
  return `Sức mạnh tương đối RS Rating: ${Math.round(meta.rsRating)}/100`;
}

export function generateSectorReasonText(meta: { rank?: number | null; sectorQuadrant?: string | null; rs3m?: number | null; sectorKey?: string | null }): string | null {
  if (meta.rank === null || meta.rank === undefined) return null;
  const parts = [`Nằm trong Top 20 Lọc ngành (hạng #${meta.rank})`];
  if (meta.sectorQuadrant) parts.push(`góc phần tư ${QUADRANT_LABEL_VI[meta.sectorQuadrant] ?? meta.sectorQuadrant}`);
  if (meta.rs3m !== null && meta.rs3m !== undefined) parts.push(`RS 3 tháng ${meta.rs3m >= 0 ? "+" : ""}${meta.rs3m.toFixed(1)}%`);
  return parts.join(", ");
}

export function generateCatalystReasonText(meta: { direction?: string | null; relatedEvents?: { title: string; daysRemaining: number; category: string }[] }): string | null {
  if (!meta.relatedEvents || meta.relatedEvents.length === 0) return null;
  const e = meta.relatedEvents[0];
  const dirLabel = meta.direction === "benefit" ? "tích cực" : meta.direction === "harm" ? "tiêu cực" : null;
  const parts = [`Sự kiện: ${e.title}`, `còn ${e.daysRemaining} ngày`];
  if (dirLabel) parts.push(`tác động ${dirLabel} tới ngành ${e.category}`);
  return parts.join(" · ");
}

export function generateMacroReasonText(meta: { sector?: string | null; asiaSectorPulse?: { basketLabelVi: string; changePercent: number } | null }): string | null {
  if (!meta.asiaSectorPulse) return null;
  const { basketLabelVi, changePercent } = meta.asiaSectorPulse;
  const sign = changePercent >= 0 ? "+" : "";
  const sectorPart = meta.sector ? `${meta.sector} · ` : "";
  return `${sectorPart}Ngành ${basketLabelVi} khu vực Châu Á đang ${sign}${changePercent.toFixed(2)}%`;
}

export function generateDividendReasonText(meta: { yieldPct?: number | null }): string | null {
  if (meta.yieldPct === null || meta.yieldPct === undefined) return null;
  return `Tỷ suất cổ tức ${meta.yieldPct.toFixed(1)}%/năm`;
}

const PENALTY_LABEL_VI: Record<string, string> = {
  bull_trap_warning: "Cảnh báo Bull Trap: giá vượt đỉnh nhưng khối lượng không xác nhận",
  elliott_alternate_counts: "Sóng Elliott có nhiều cách đếm khác nhau, độ tin cậy giảm",
  suspect_data: "Dữ liệu đầu vào có dấu hiệu bất thường",
  ta_collinearity: "2 nguồn tín hiệu kỹ thuật tương quan quá cao, giảm trọng số trùng lặp",
};

export function getPenaltyLabelVi(key: string): string {
  return PENALTY_LABEL_VI[key] ?? key;
}
