// lib/catalyst/dedup/isDuplicateByUrl.ts
//
// Kiem tra CHINH XAC (khong phai heuristic) truoc khi chay logic gop su kien
// theo thoi gian (findMatchingSource trong sourceIngestion.ts). Neu 1 sourceUrl
// da ton tai (o CatalystSource.sourceUrl HOAC o bang SourceReference), coi la
// da ingest roi -> bo qua ngay, KHONG chay heuristic 36h nua.
//
// Ly do can buoc nay TRUOC heuristic: heuristic 36h + target overlap co the gop
// NHAM 2 su kien khac nhau xay ra trung thoi diem tren cung 1 muc tieu (vd tin
// thep + tin nganh khac cung ngay, trung target ngau nhien). Kiem tra URL truoc
// la buoc chinh xac tuyet doi (URL giong het = chac chan cung 1 bai viet), chi
// roi vao heuristic khi URL That Su Moi (chua tung thay).

import { prisma } from "@/lib/prisma";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingSourceId: string | null;
  matchedVia: "source_url" | "reference_url" | null;
}

export async function isDuplicateByUrl(sourceUrl: string): Promise<DuplicateCheckResult> {
  if (!sourceUrl) {
    return { isDuplicate: false, existingSourceId: null, matchedVia: null };
  }

  // Kiem tra 2 noi co the chua URL nay: CatalystSource.sourceUrl (nguon dau tien
  // phat hien) va SourceReference.sourceUrl (cac nguon xac nhan sau).
  const [asOriginSource, asReference] = await Promise.all([
    prisma.catalystSource.findFirst({
      where: { sourceUrl },
      select: { id: true },
    }),
    prisma.sourceReference.findFirst({
      where: { sourceUrl },
      select: { sourceId: true },
    }),
  ]);

  if (asOriginSource) {
    return { isDuplicate: true, existingSourceId: asOriginSource.id, matchedVia: "source_url" };
  }

  if (asReference) {
    return { isDuplicate: true, existingSourceId: asReference.sourceId, matchedVia: "reference_url" };
  }

  return { isDuplicate: false, existingSourceId: null, matchedVia: null };
}

// Ban batch - kiem tra nhieu URL cung luc truoc khi ingest ca lo (vd sau khi
// scraper CafeF tra ve 30 URL), tranh N request rieng le vao DB.
export async function findDuplicateUrls(sourceUrls: string[]): Promise<Set<string>> {
  if (sourceUrls.length === 0) return new Set();

  const [originMatches, referenceMatches] = await Promise.all([
    prisma.catalystSource.findMany({
      where: { sourceUrl: { in: sourceUrls } },
      select: { sourceUrl: true },
    }),
    prisma.sourceReference.findMany({
      where: { sourceUrl: { in: sourceUrls } },
      select: { sourceUrl: true },
    }),
  ]);

  const duplicates = new Set<string>();
  for (const m of originMatches) {
    if (m.sourceUrl) duplicates.add(m.sourceUrl);
  }
  for (const m of referenceMatches) {
    duplicates.add(m.sourceUrl);
  }
  return duplicates;
}
