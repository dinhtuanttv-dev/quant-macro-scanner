// Đọc GỌN dữ liệu Cổ tức — CHỈ đổi CÁCH ĐỌC, kết quả tính ra GIỐNG HỆT (người dùng duyệt 2026-10-15, vượt quota egress Supabase).
//   - Cắt JSON ngay trong Postgres (jsonb): chỉ các nhánh của `snapshot` mà nơi gọi thực sự dùng; giá trị giữ nguyên.
//   - Đệm theo DẤU THAY ĐỔI (không theo thời gian): hỏi count + max(thời điểm cập nhật) (~200 byte); chỉ khi dữ liệu nguồn
//     đổi mới đọc & tính lại -> cùng đầu vào thì cùng đầu ra, không có dữ liệu cũ.
import { getCotucDataVersion } from "@/lib/cotuc/data-version";
import { asDate, storeList, storeStatus } from "@/lib/cotuc/store/gateway-store";

// B2 (25/10/2026): đọc từ KHO CỔ TỨC trên Gateway (thay Neon). Chiếu trường làm ở Gateway (đường dẫn chấm) — cùng các nhánh
// snapshot như truy vấn jsonb trước đây, giá trị giữ nguyên.

export interface StoredRate { id: string; nEvents: number; winRate: number }

const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** backtest[].{id, nEvents, winRate} của mọi mã — cùng giá trị cron timing-signals-scan đọc từ snapshot.backtest. */
export async function loadBacktestRates(): Promise<{ ticker: string; bt: StoredRate[] }[]> {
  const rows = await storeList<{ ticker: string; snapshot?: { backtest?: unknown } }>("decision", { fields: ["ticker", "snapshot.backtest"] });
  return rows.map((r) => ({
    ticker: r.ticker,
    bt: arr(r.snapshot?.backtest).map((w: { id: string; nEvents: number; winRate: number }) => ({ id: w.id, nEvents: w.nEvents, winRate: w.winRate })),
  }));
}

/** Nhánh snapshot cho Timeline điểm mua: exDate, decision.level, signals, backtest (nguyên giá trị) + computedAt. */
export async function loadDecisionForTimeline(): Promise<{ ticker: string; computedAt: Date; snapshot: Record<string, unknown> }[]> {
  const rows = await storeList<{ ticker: string; computedAt: string; snapshot?: Record<string, unknown> }>("decision", {
    fields: ["ticker", "computedAt", "snapshot.exDate", "snapshot.decision.level", "snapshot.signals", "snapshot.backtest"],
  });
  return rows.map((r) => ({ ticker: r.ticker, computedAt: asDate(r.computedAt)!, snapshot: r.snapshot ?? {} }));
}

/** Nhánh snapshot cho cột Screener: exDate.status, recommendation.earningsImpact.conflict. */
export async function loadDecisionFlags(): Promise<{ ticker: string; snapshot: { exDate?: { status?: string }; recommendation?: { earningsImpact?: { conflict?: string } } } }[]> {
  const rows = await storeList<{ ticker: string; snapshot?: { exDate?: { status?: string } | null; recommendation?: { earningsImpact?: { conflict?: string } } } }>("decision", {
    fields: ["ticker", "snapshot.exDate.status", "snapshot.exDate", "snapshot.recommendation.earningsImpact.conflict"],
  });
  return rows.map((r) => {
    const ex = r.snapshot?.exDate;
    const conflict = r.snapshot?.recommendation?.earningsImpact?.conflict;
    return {
      ticker: r.ticker,
      snapshot: {
        ...(ex ? { exDate: ex.status != null ? { status: ex.status } : {} } : {}),
        ...(conflict != null ? { recommendation: { earningsImpact: { conflict } } } : {}),
      },
    };
  });
}

/** Dấu thay đổi của dữ liệu nguồn Cổ tức. */
export async function cotucSourceStamp(): Promise<string> {
  // N2: phiên bản dữ liệu trong KV (hai cron ghi tăng sau mỗi lô); chưa có thì dùng thời điểm ghi cuối của kho Gateway.
  const v = await getCotucDataVersion();
  if (v) return `kv:${v}`;
  const t = (await storeStatus()).tables;
  return `gw:${t.decision.updatedAt}|${t.season.updatedAt}|${t.meta.updatedAt}|${t.decision.rows}|${t.season.rows}`;
}

/**
 * Đệm theo dấu thay đổi: `stamp()` rẻ; khi dấu giống lần trước trả lại kết quả cũ (cùng đầu vào => cùng đầu ra), khác thì tính lại.
 * Gọi đồng thời chỉ tính một lần.
 */
export function memoByStamp<T>(stamp: () => Promise<string>, compute: () => Promise<T>) {
  let cache: { key: string; value: T } | null = null;
  let inflight: { key: string; p: Promise<T> } | null = null;
  return async (): Promise<T> => {
    const key = await stamp();
    if (cache && cache.key === key) return cache.value;
    if (inflight && inflight.key === key) return inflight.p;
    const p = compute().then((value) => { cache = { key, value }; return value; }).finally(() => { if (inflight?.p === p) inflight = null; });
    inflight = { key, p };
    return p;
  };
}
