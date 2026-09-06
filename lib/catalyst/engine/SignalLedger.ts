// lib/catalyst/engine/SignalLedger.ts
// Ghi lai TUNG tin hieu catalyst that theo dung khoa (category, propagationDistance)
// ma CatalystEngine.getWinRate() da dung san - de sau nay tinh xong thi ghi
// thang vao catalyst:calibration, CatalystEngine tu doc duoc, KHONG can sua Engine.
import type { Redis } from "@upstash/redis";
import type { CatalystCategory, PropagationDistance, CalibrationEntry } from "../types";

const LEDGER_KEY = "catalyst:signal-ledger";
const CALIBRATION_KEY = "catalyst:calibration";
const HOLD_PERIOD_SESSIONS = 5; // "trung han" - khop horizon: "medium" da co
const MIN_SAMPLE_SIZE = 5; // chua du 5 mau thi chua ghi vao calibration (tranh nhieu)

export interface SignalRecord {
  id: string;
  ticker: string;
  category: CatalystCategory;
  propagationDistance: PropagationDistance;
  direction: "benefit" | "harm";
  sourceId: string;
  priceAtSignal: number | null; // null luc dau, dien sau boi buoc rieng
  scannedAt: string;
  evaluatedAt: string | null;
  priceAtEvaluation: number | null;
  won: boolean | null;
}

function makeRecordId(sourceId: string, ticker: string): string {
  return `${sourceId}::${ticker}`;
}

// Ghi tin hieu MOI - KHONG goi Yahoo o day (tranh lam cham vong lap tinh diem chinh).
// Gia se duoc dien sau boi fillMissingPrices().
export async function recordNewSignal(
  redis: Redis,
  params: { ticker: string; category: CatalystCategory; propagationDistance: PropagationDistance; direction: "benefit" | "harm"; sourceId: string }
): Promise<void> {
  const id = makeRecordId(params.sourceId, params.ticker);
  const existing = await redis.hget<SignalRecord>(LEDGER_KEY, id);
  if (existing) return;

  const record: SignalRecord = {
    id, ...params,
    priceAtSignal: null, scannedAt: new Date().toISOString(),
    evaluatedAt: null, priceAtEvaluation: null, won: null,
  };
  await redis.hset(LEDGER_KEY, { [id]: record });
}

export async function getRecordsMissingPrice(redis: Redis): Promise<SignalRecord[]> {
  const all = await redis.hgetall<Record<string, SignalRecord>>(LEDGER_KEY);
  if (!all) return [];
  return Object.values(all).filter((r) => r.priceAtSignal === null);
}

export async function fillPriceAtSignal(redis: Redis, id: string, price: number): Promise<void> {
  const existing = await redis.hget<SignalRecord>(LEDGER_KEY, id);
  if (!existing) return;
  await redis.hset(LEDGER_KEY, { [id]: { ...existing, priceAtSignal: price } });
}

export async function getUnevaluatedMaturedSignals(redis: Redis): Promise<SignalRecord[]> {
  const all = await redis.hgetall<Record<string, SignalRecord>>(LEDGER_KEY);
  if (!all) return [];
  const now = Date.now();
  const holdMs = HOLD_PERIOD_SESSIONS * 24 * 60 * 60 * 1000;
  return Object.values(all).filter((r) => {
    if (r.won !== null) return false;
    if (r.priceAtSignal === null) return false;
    return now - new Date(r.scannedAt).getTime() >= holdMs;
  });
}

export async function recordEvaluation(redis: Redis, id: string, priceAtEvaluation: number, won: boolean): Promise<void> {
  const existing = await redis.hget<SignalRecord>(LEDGER_KEY, id);
  if (!existing) return;
  await redis.hset(LEDGER_KEY, { [id]: { ...existing, evaluatedAt: new Date().toISOString(), priceAtEvaluation, won } });
}

// Tinh lai calibration THAT tu cac tin hieu da co ket qua, ghi THANG vao
// catalyst:calibration - CatalystEngine.getWinRate() se tu dong doc duoc,
// khong can sua gi trong CatalystEngine.ts.
export async function recomputeAndWriteCalibration(redis: Redis): Promise<{ written: number; totalGroups: number }> {
  const all = await redis.hgetall<Record<string, SignalRecord>>(LEDGER_KEY);
  if (!all) return { written: 0, totalGroups: 0 };

  const groups: Record<string, { wins: number; total: number; category: CatalystCategory; propagationDistance: PropagationDistance }> = {};
  Object.values(all).forEach((r) => {
    if (r.won === null) return;
    const key = `${r.category}::${r.propagationDistance}`;
    if (!groups[key]) groups[key] = { wins: 0, total: 0, category: r.category, propagationDistance: r.propagationDistance };
    groups[key].total++;
    if (r.won) groups[key].wins++;
  });

  const entries: CalibrationEntry[] = Object.values(groups)
    .filter((g) => g.total >= MIN_SAMPLE_SIZE)
    .map((g) => ({
      category: g.category, propagationDistance: g.propagationDistance,
      historicalWinRate: Math.round((g.wins / g.total) * 100),
    }));

  await redis.set(CALIBRATION_KEY, entries);
  return { written: entries.length, totalGroups: Object.keys(groups).length };
}

export { HOLD_PERIOD_SESSIONS, MIN_SAMPLE_SIZE };
