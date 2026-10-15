// Đọc GỌN bảng CotucDecisionState — chỉ các nhánh JSON thực sự dùng, cắt ngay trong Postgres (jsonb), không kéo nguyên `snapshot`.
// Lý do (10/2026, vượt quota egress Supabase 12,74/5,5 GB): `snapshot` chứa cả timeline, kế hoạch vào lệnh, thành phần xác suất…
// nhưng:
//   - cron timing-signals-scan (Gateway gọi mỗi 3 phút trong phiên) chỉ cần backtest[].{id, nEvents, winRate} của các mã khác;
//   - /api/cotuc/buy-timeline (thanh bên Elite Command Radar trên MỌI tab) chỉ cần exDate, decision.level, signals, backtest;
//   - /api/cotuc/timing-signals chỉ cần exDate.status và recommendation.earningsImpact.conflict.
import { prisma } from "@/lib/prisma";

export interface StoredRate { id: string; nEvents: number; winRate: number }

const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** backtest[].{id, nEvents, winRate} của mọi mã (prior Beta liên mã). */
export async function loadBacktestRates(): Promise<{ ticker: string; bt: StoredRate[] }[]> {
  const rows = await prisma.$queryRaw<{ ticker: string; bt: unknown }[]>`
    SELECT ticker,
      CASE WHEN jsonb_typeof(snapshot->'backtest') = 'array' THEN (
        SELECT jsonb_agg(jsonb_build_object('id', w->'id', 'nEvents', w->'nEvents', 'winRate', w->'winRate'))
        FROM jsonb_array_elements(snapshot->'backtest') AS w
      ) END AS bt
    FROM "CotucDecisionState"`;
  return rows.map((r) => ({ ticker: r.ticker, bt: arr(r.bt) as StoredRate[] }));
}

/** Phần snapshot cho Timeline điểm mua: exDate, decision.level, signals, backtest (+ computedAt). */
export async function loadDecisionForTimeline(): Promise<{ ticker: string; computedAt: Date; snapshot: Record<string, unknown> }[]> {
  return prisma.$queryRaw<{ ticker: string; computedAt: Date; snapshot: Record<string, unknown> }[]>`
    SELECT ticker, "computedAt",
      jsonb_build_object(
        'exDate', snapshot->'exDate',
        'decision', jsonb_build_object('level', snapshot->'decision'->'level'),
        'signals', snapshot->'signals',
        'backtest', snapshot->'backtest'
      ) AS snapshot
    FROM "CotucDecisionState"`;
}

/** Phần snapshot cho cột Screener: exDate.status, recommendation.earningsImpact.conflict. */
export async function loadDecisionFlags(): Promise<{ ticker: string; snapshot: { exDate: { status: string | null } | null; recommendation: { earningsImpact: { conflict: string | null } } } }[]> {
  const rows = await prisma.$queryRaw<{ ticker: string; ex_status: string | null; conflict: string | null }[]>`
    SELECT ticker, snapshot->'exDate'->>'status' AS ex_status, snapshot->'recommendation'->'earningsImpact'->>'conflict' AS conflict
    FROM "CotucDecisionState"`;
  return rows.map((r) => ({ ticker: r.ticker, snapshot: { exDate: r.ex_status ? { status: r.ex_status } : null, recommendation: { earningsImpact: { conflict: r.conflict } } } }));
}

/** Bộ nhớ đệm theo thời gian cho một giá trị tính đắt (mỗi instance serverless). */
export function memoTtl<T>(ttlMs: number, load: () => Promise<T>, now: () => number = Date.now) {
  let cache: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  return async (force = false): Promise<T> => {
    if (!force && cache && now() - cache.at < ttlMs) return cache.value;
    inflight ??= load().then((value) => { cache = { at: now(), value }; return value; }).finally(() => { inflight = null; });
    return inflight;
  };
}
