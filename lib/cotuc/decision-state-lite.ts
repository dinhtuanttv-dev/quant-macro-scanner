// Đọc GỌN dữ liệu Cổ tức — CHỈ đổi CÁCH ĐỌC, kết quả tính ra GIỐNG HỆT (người dùng duyệt 2026-10-15, vượt quota egress Supabase).
//   - Cắt JSON ngay trong Postgres (jsonb): chỉ các nhánh của `snapshot` mà nơi gọi thực sự dùng; giá trị giữ nguyên.
//   - Đệm theo DẤU THAY ĐỔI (không theo thời gian): hỏi count + max(thời điểm cập nhật) (~200 byte); chỉ khi dữ liệu nguồn
//     đổi mới đọc & tính lại -> cùng đầu vào thì cùng đầu ra, không có dữ liệu cũ.
import { prisma } from "@/lib/prisma";
import { getCotucDataVersion } from "@/lib/cotuc/data-version";

export interface StoredRate { id: string; nEvents: number; winRate: number }

const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** backtest[].{id, nEvents, winRate} của mọi mã — cùng giá trị cron timing-signals-scan đọc từ snapshot.backtest. */
export async function loadBacktestRates(): Promise<{ ticker: string; bt: StoredRate[] }[]> {
  const rows = await prisma.$queryRaw<{ ticker: string; bt: unknown }[]>`
    SELECT ticker,
      CASE WHEN jsonb_typeof(snapshot->'backtest') = 'array' THEN (
        SELECT jsonb_agg(jsonb_build_object('id', w->'id', 'nEvents', w->'nEvents', 'winRate', w->'winRate'))
        FROM jsonb_array_elements(snapshot->'backtest') AS w
      ) END AS bt
    FROM "CotucDecisionState"`;
  return rows.map((r: { ticker: string; bt: unknown }) => ({ ticker: r.ticker, bt: arr(r.bt) as StoredRate[] }));
}

/** Nhánh snapshot cho Timeline điểm mua: exDate, decision.level, signals, backtest (nguyên giá trị) + computedAt. */
export async function loadDecisionForTimeline(): Promise<{ ticker: string; computedAt: Date; snapshot: Record<string, unknown> }[]> {
  return prisma.$queryRaw<{ ticker: string; computedAt: Date; snapshot: Record<string, unknown> }[]>`
    SELECT ticker, "computedAt",
      -- KHÔNG dùng jsonb_strip_nulls (đệ quy, sẽ xoá null bên trong backtest/signals). Nhánh vắng -> JSON null; nơi dùng
      -- đều đọc qua ?. / ?? nên null và vắng cho cùng kết quả. Giá trị lồng bên trong giữ nguyên tuyệt đối.
      jsonb_build_object(
        'exDate', snapshot->'exDate',
        'decision', CASE WHEN snapshot->'decision' IS NOT NULL THEN jsonb_build_object('level', snapshot->'decision'->'level') END,
        'signals', snapshot->'signals',
        'backtest', snapshot->'backtest'
      ) AS snapshot
    FROM "CotucDecisionState"`;
}

/** Nhánh snapshot cho cột Screener: exDate.status, recommendation.earningsImpact.conflict. */
export async function loadDecisionFlags(): Promise<{ ticker: string; snapshot: { exDate?: { status?: string }; recommendation?: { earningsImpact?: { conflict?: string } } } }[]> {
  const rows = await prisma.$queryRaw<{ ticker: string; has_ex: boolean; ex_status: string | null; conflict: string | null }[]>`
    SELECT ticker,
      (snapshot->'exDate') IS NOT NULL AND jsonb_typeof(snapshot->'exDate') <> 'null' AS has_ex,
      snapshot->'exDate'->>'status' AS ex_status,
      snapshot->'recommendation'->'earningsImpact'->>'conflict' AS conflict
    FROM "CotucDecisionState"`;
  return rows.map((r: { ticker: string; has_ex: boolean; ex_status: string | null; conflict: string | null }) => ({
    ticker: r.ticker,
    snapshot: {
      ...(r.has_ex ? { exDate: r.ex_status != null ? { status: r.ex_status } : {} } : {}),
      ...(r.conflict != null ? { recommendation: { earningsImpact: { conflict: r.conflict } } } : {}),
    },
  }));
}

/** Dấu thay đổi của hai bảng nguồn Cổ tức (~200 byte). */
export async function cotucSourceStamp(): Promise<string> {
  // N2: phiên bản dữ liệu trong KV (hai cron ghi tăng sau mỗi lô) -> không truy vấn Neon; chưa có thì dùng dấu Postgres như cũ.
  const v = await getCotucDataVersion();
  if (v) return `kv:${v}`;
  const [d, s] = await Promise.all([
    // count + max + TỔNG epoch: bất kỳ dòng nào được ghi (kể cả thời điểm nhỏ hơn max hiện tại) đều đổi dấu
    prisma.$queryRaw<{ n: number; m: Date | null; sm: string | null }[]>`SELECT count(*)::int AS n, max("computedAt") AS m, sum(extract(epoch from "computedAt"))::text AS sm FROM "CotucDecisionState"`,
    prisma.$queryRaw<{ n: number; c: Date | null; f: Date | null; sc: string | null; sf: string | null }[]>`SELECT count(*)::int AS n, max("collectedAt") AS c, max("finalizedAt") AS f, sum(extract(epoch from "collectedAt"))::text AS sc, sum(extract(epoch from "finalizedAt"))::text AS sf FROM "EarningsSeasonalityCache"`,
  ]);
  const t = (x: Date | null | undefined) => (x ? new Date(x).toISOString() : "-");
  return `${d[0]?.n ?? 0}|${t(d[0]?.m)}|${d[0]?.sm ?? "-"}|${s[0]?.n ?? 0}|${t(s[0]?.c)}|${t(s[0]?.f)}|${s[0]?.sc ?? "-"}|${s[0]?.sf ?? "-"}`;
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
