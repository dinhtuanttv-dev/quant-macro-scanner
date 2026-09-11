// lib/catalyst/engine/SectorRegistry.ts
//
// SELF-HEALING SECTOR REGISTRY
//
// Van de goc: classifySectors() trong lib/macro/classifier.ts tra ve key TIENG ANH
// (vd "Banking", "Steel"). Neu key nay khong co trong bang anh xa tinh, he thong
// CU se leak nguyen key tieng Anh ra UI (bug that da xay ra: "Macro_General",
// "Steel" xuat hien nhu 1 nganh that tren giao dien).
//
// Co che tu chua lanh (Self-Healing) gom 3 lop phong thu, theo dung thu tu:
//
//   Lop 1 - NORMALIZED STATIC MAP: chuan hoa key (bo dau gach duoi/khoang trang/
//           hoa-thuong) truoc khi tra bang tinh, xu ly duoc bien the cung 1 key
//           (vd "Real_Estate" / "RealEstate" / "real estate" deu khop 1 entry).
//
//   Lop 2 - SENTINEL EXCLUSION: cac gia tri KHONG PHAI nganh that (vd fallback
//           cua classifySectors khi khong khop tu khoa nao) bi loai ngay, tra ve
//           null co chu dich - KHONG tao sector-edge gia.
//
//   Lop 3 - QUARANTINE REGISTRY: key khong khop Lop 1, khong phai Lop 2 (tuc la
//           THAT SU MOI, developer quen cap nhat bang anh xa) -> ghi vao Redis
//           set "catalyst:unmapped_sectors" de admin ra soat sau, tra ve null
//           cho LAN NAY (khong tao sector-edge sai ngon ngu), NHUNG van giu lai
//           ticker-edge neu tin do co neu ro ma cu the (khong mat du lieu ticker).

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const UNMAPPED_REGISTRY_KEY = "catalyst:unmapped_sectors";

// Lop 1: bang anh xa tinh, tu classifier.ts sang ten chuan he thong dang dung
const RAW_SECTOR_MAP: Record<string, string> = {
  banking: "Ngan hang",
  realestate: "Bat dong san",
  steel: "Thep",
  oilgas: "Dau khi",
  securities: "Chung khoan",
  exporttextile: "Det may",
  technology: "Cong nghe",
  agriculture: "Nong san",

  // FIX (2026-09-11): PHAT HIEN LOI THAT - hose-ingest.ts dung findSector()
  // lay thang nhan "sector" tu stockUniverse (lib/quant-data.ts) roi truyen
  // qua resolveSectorName() giong het cac tin RSS thuong (qua classifier.ts).
  // Nhung 2 nguon nay dung TU VUNG KHAC NHAU: classifier.ts sinh key kieu
  // tieng Anh ("Banking", "Steel"...), con stockUniverse dung thang nhan
  // tieng Viet khong dau ("Ngan hang", "Cao su"...) - lam MOI nhan tu HOSE
  // deu roi vao quarantine oan, du la nhan da CHUAN, khong can dich them.
  // Them toan bo 19 nganh THAT trong stockUniverse (khong chi 2 nganh dang
  // thay tren UI - de tranh cac nganh HOSE khac tiep tuc bi bao "chua anh
  // xa" oan trong tuong lai). Anh xa "chinh no" vi da la nhan chuan.
  "cong nghe": "Cong nghe",
  "dau khi": "Dau khi",
  "ngan hang": "Ngan hang",
  "van tai bien": "Van tai bien",
  "hoa chat": "Hoa chat",
  "cao su": "Cao su",
  "ban le": "Ban le",
  "bat dong san": "Bat dong san",
  "thep": "Thep",
  "chung khoan": "Chung khoan",
  "phan bon/hoa chat": "Phan bon/Hoa chat",
  "nang luong/dien": "Nang luong/Dien",
  "hang khong": "Hang khong",
  "khu cong nghiep": "Khu cong nghiep",
  "det may": "Det may",
  "xuat khau (go, thuy san)": "Xuat khau (Go, Thuy san)",
  "duoc pham": "Duoc pham",
  "nong nghiep": "Nong nghiep",
  "vat lieu xay dung": "Vat lieu xay dung",
};

// Lop 2: gia tri sentinel - KHONG PHAI nganh that, loai truc tiep khong qua Lop 3
const SENTINEL_VALUES = new Set(["macrogeneral", "unknown", "n/a", "none", ""]);

function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[_\s-]+/g, "");
}

// Cache Map da chuan hoa - build 1 lan (module-level, ton tai suot lifetime server)
let normalizedMapCache: Map<string, string> | null = null;

function getNormalizedMap(): Map<string, string> {
  if (normalizedMapCache) return normalizedMapCache;
  normalizedMapCache = new Map();
  for (const [key, value] of Object.entries(RAW_SECTOR_MAP)) {
    normalizedMapCache.set(normalizeKey(key), value);
  }
  return normalizedMapCache;
}

export interface SectorResolution {
  displayName: string | null; // null = khong nen tao sector-edge cho tin nay
  wasUnmapped: boolean;       // true = da ghi vao quarantine registry (can admin xem)
}

// Ham dong bo, dung khi khong can ghi quarantine (vd preview/test nhanh)
export function resolveSectorNameSync(rawKey: string): string | null {
  const normalized = normalizeKey(rawKey);

  if (SENTINEL_VALUES.has(normalized)) return null; // Lop 2

  const map = getNormalizedMap();
  const hit = map.get(normalized);
  if (hit) return hit; // Lop 1

  return null; // Lop 3 se xu ly o ban async, ham sync khong ghi Redis duoc an toan
}

// Ham chinh dung trong pipeline ingest - co ghi quarantine registry khi can (Lop 3)
export async function resolveSectorName(rawKey: string): Promise<SectorResolution> {
  const normalized = normalizeKey(rawKey);

  if (SENTINEL_VALUES.has(normalized)) {
    return { displayName: null, wasUnmapped: false };
  }

  const map = getNormalizedMap();
  const hit = map.get(normalized);
  if (hit) {
    return { displayName: hit, wasUnmapped: false };
  }

  // Lop 3: key that su moi, chua tung gap - ghi quarantine, khong throw, khong crash
  try {
    await redis.hincrby(UNMAPPED_REGISTRY_KEY, rawKey, 1);
  } catch (err) {
    // Neu Redis loi, KHONG lam gian doan pipeline ingest chinh - chi log canh bao
    console.warn(`[SectorRegistry] Khong ghi duoc quarantine cho key "${rawKey}":`, err);
  }

  return { displayName: null, wasUnmapped: true };
}

// Doc lai danh sach nganh chua anh xa - dung cho admin panel.
// FIX (2026-09-11): loc bo TU DONG cac key TRUOC DAY bi quarantine nhung
// GIO DA duoc them vao RAW_SECTOR_MAP (VD sau khi sua loi nay) - neu khong
// loc, entry cu se "ket dinh" mai trong Redis, hien "chua anh xa" gia du
// code da sua dung, gay hieu lam. Khong can chay script don dep thu cong
// moi lan cap nhat RAW_SECTOR_MAP nua.
export async function getUnmappedSectors(): Promise<Record<string, number>> {
  const data = await redis.hgetall<Record<string, number>>(UNMAPPED_REGISTRY_KEY);
  if (!data) return {};

  const stillUnmapped: Record<string, number> = {};
  const nowResolvedKeys: string[] = [];
  for (const [rawKey, count] of Object.entries(data)) {
    if (resolveSectorNameSync(rawKey) !== null) {
      nowResolvedKeys.push(rawKey); // da co trong RAW_SECTOR_MAP - khong con can admin xem
    } else {
      stillUnmapped[rawKey] = count;
    }
  }

  // Don dep ngam cac key da duoc giai quyet - khong lam cham response (fire-and-forget)
  if (nowResolvedKeys.length > 0) {
    Promise.all(nowResolvedKeys.map((k) => clearResolvedFromQuarantine(k))).catch((err) =>
      console.warn("[SectorRegistry] Loi don dep quarantine da giai quyet:", err),
    );
  }

  return stillUnmapped;
}

// Sau khi admin them entry moi vao RAW_SECTOR_MAP va deploy, goi ham nay de xoa
// key da xu ly khoi quarantine registry (dop dep, tranh registry phinh to mai)
export async function clearResolvedFromQuarantine(rawKey: string): Promise<void> {
  await redis.hdel(UNMAPPED_REGISTRY_KEY, rawKey);
}
