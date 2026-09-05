// lib/catalyst/engine/SnapshotStore.ts
//
// H3 + H4 - THAY THE CO CHE TTL-EXPIRY BANG STALENESS-AWARE FALLBACK, THEM
// LICH SU SNAPSHOT DE PHAN TICH XU HUONG.
//
// H3 - Van de goc: snapshot cu dung `redis.set(key, data, { ex: 1800 })` - neu
// scan that bai lien tuc qua 30 phut, du lieu TU BIEN MAT hoan toan, UI nhay
// thang tu "co du lieu" sang "Chua co du lieu" khong ro ly do. Giai phap dung:
// KHONG dat TTL cho snapshot chinh nua - giu du lieu CU cho den khi co du lieu
// MOI thanh cong thay the. Do "cu" duoc tinh o tang doc (read time) dua vao
// scannedAt, khong dua vao co che xoa tu dong cua Redis.
//
// H4 - Them: moi lan ghi snapshot thanh cong, luu 1 ban tom tat (KHONG luu full
// snapshot - tranh phinh dung luong) vao Sorted Set, score = timestamp, cho phep
// truy van theo khoang thoi gian O(log n) - nen tang cho bieu do xu huong theo
// gio/ngay o phase sau (chua lam UI, chi chuan bi ha tang du lieu).

import type { Redis } from "@upstash/redis";

const LATEST_KEY = "catalyst:snapshot:latest";
const HISTORY_KEY = "catalyst:snapshot:history";
const MAX_HISTORY_ENTRIES = 96; // vd quet moi 15 phut -> 96 ban ghi = 24 gio

const STALE_THRESHOLD_MINUTES = 30; // nguong coi la "cu", co the tinh chinh sau

export interface SnapshotHistoryEntry {
  scannedAt: string;
  sectorCount: number;
  totalBenefitCount: number;
  totalHarmCount: number;
  upcomingEventCount: number;
}

export interface SnapshotReadResult<T> {
  snapshot: T | null;
  isStale: boolean;
  ageMinutes: number | null;
}

// Ghi snapshot AN TOAN: khong dat TTL, luon ghi de len ban cu CHI KHI co du lieu
// moi thanh cong (ham nay chi duoc goi sau khi toan bo tinh toan da xong xuoi,
// dam bao khong bao gio ghi du lieu nua vo/loi vao vi tri chinh).
export async function writeSnapshotSafe<T extends { scannedAt: string; sectors?: unknown[]; totalBenefitCount?: number; totalHarmCount?: number; upcomingEvents?: unknown[] }>(
  redis: Redis,
  snapshot: T
): Promise<void> {
  // Khong con { ex: ... } nua - snapshot ton tai vinh vien cho den khi bi ghi de
  await redis.set(LATEST_KEY, snapshot);

  const historyEntry: SnapshotHistoryEntry = {
    scannedAt: snapshot.scannedAt,
    sectorCount: snapshot.sectors?.length ?? 0,
    totalBenefitCount: snapshot.totalBenefitCount ?? 0,
    totalHarmCount: snapshot.totalHarmCount ?? 0,
    upcomingEventCount: snapshot.upcomingEvents?.length ?? 0,
  };

  await redis.zadd(HISTORY_KEY, {
    score: Date.now(),
    member: JSON.stringify(historyEntry),
  });

  // Don dep - chi giu MAX_HISTORY_ENTRIES ban ghi gan nhat, xoa bot ban cu
  await redis.zremrangebyrank(HISTORY_KEY, 0, -(MAX_HISTORY_ENTRIES + 1));
}

// Doc snapshot kem thong tin "co cu khong" - THAY THE cho viec du lieu tu bien
// mat. UI dung isStale + ageMinutes de hien thi canh bao thay vi man hinh trong.
export async function readSnapshotWithStaleness<T extends { scannedAt: string }>(
  redis: Redis
): Promise<SnapshotReadResult<T>> {
  const snapshot = await redis.get<T>(LATEST_KEY);

  if (!snapshot) {
    return { snapshot: null, isStale: false, ageMinutes: null };
  }

  const ageMinutes = (Date.now() - new Date(snapshot.scannedAt).getTime()) / 60000;
  const isStale = ageMinutes > STALE_THRESHOLD_MINUTES;

  return { snapshot, isStale, ageMinutes: Math.round(ageMinutes) };
}

// Doc lich su tom tat - dung cho bieu do xu huong (chuan bi ha tang, UI phase sau)
export async function readSnapshotHistory(
  redis: Redis,
  limit: number = MAX_HISTORY_ENTRIES
): Promise<SnapshotHistoryEntry[]> {
  const raw = await redis.zrange<string[]>(HISTORY_KEY, -limit, -1);
  return raw.map((entry) => JSON.parse(entry) as SnapshotHistoryEntry);
}
