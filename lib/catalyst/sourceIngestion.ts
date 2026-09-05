// lib/catalyst/sourceIngestion.ts — PHASE 1 UPGRADE
// Da them buoc isDuplicateByUrl() CHINH XAC tuyet doi, chay TRUOC heuristic gop
// su kien theo thoi gian (findMatchingSource) - ngan chan rui ro gop nham 2 su
// kien khac nhau trung thoi diem tren cung 1 target (da neu trong ra soat #2).

import { prisma } from "@/lib/prisma";
import type { RawSourceRecord } from "./types";
import { isDuplicateByUrl } from "./dedup/isDuplicateByUrl";

const MERGE_WINDOW_HOURS = 36;
const DEFAULT_PROPAGATION = "direct" as const;

export interface IngestSummary {
  createdCount: number;
  mergedCount: number;
  skippedCount: number;
  duplicateUrlCount: number; // ★MỚI: đếm riêng số bị chặn ở bước kiểm tra URL chính xác
  errorCount: number;
}

async function findMatchingSource(record: RawSourceRecord) {
  const windowStart = new Date(record.publishedDate.getTime() - MERGE_WINDOW_HOURS * 3600 * 1000);
  const windowEnd = new Date(record.publishedDate.getTime() + MERGE_WINDOW_HOURS * 3600 * 1000);

  const candidates = await prisma.catalystSource.findMany({
    where: {
      category: record.category,
      publishedDate: { gte: windowStart, lte: windowEnd },
    },
    include: { edges: true },
  });

  const recordTargets = new Set([...record.sectors, ...record.tickers]);

  for (const candidate of candidates) {
    const candidateTargets = new Set(candidate.edges.map((e) => e.targetId));
    const hasOverlap = [...recordTargets].some((t) => candidateTargets.has(t));
    if (hasOverlap) return candidate;
  }

  return null;
}

async function mergeIntoExisting(existingId: string, record: RawSourceRecord): Promise<void> {
  const alreadyReferenced = await prisma.sourceReference.findFirst({
    where: { sourceId: existingId, sourceUrl: record.sourceUrl },
  });

  if (!alreadyReferenced) {
    await prisma.$transaction([
      prisma.sourceReference.create({
        data: {
          sourceId: existingId,
          sourceName: record.sourceName,
          sourceUrl: record.sourceUrl,
        },
      }),
      prisma.catalystSource.update({
        where: { id: existingId },
        data: { corroborationCount: { increment: 1 } },
      }),
    ]);
  }
}

async function createNew(record: RawSourceRecord): Promise<void> {
  const source = await prisma.catalystSource.create({
    data: {
      title: record.title,
      category: record.category,
      sourceCredibility: record.sourceCredibility,
      publishedDate: record.publishedDate,
      executionDate: record.executionDate ?? null,
      firstDetectedAt: new Date(),
      corroborationCount: 1,
      originRecordId: record.originRecordId ?? null,
      sourceUrl: record.sourceUrl,
      targetPrice: record.targetPrice ?? null,
    },
  });

  const edgesToCreate = [
    ...record.sectors.map((sector) => ({
      sourceId: source.id,
      targetType: "sector" as const,
      targetId: sector,
      direction: record.direction,
      propagationDistance: DEFAULT_PROPAGATION,
      hopCount: 1,
      baseWeight: record.baseWeight,
      decayRate: record.decayRate,
      horizon: record.horizon,
    })),
    ...record.tickers.map((ticker) => ({
      sourceId: source.id,
      targetType: "ticker" as const,
      targetId: ticker,
      direction: record.direction,
      propagationDistance: DEFAULT_PROPAGATION,
      hopCount: 1,
      baseWeight: record.baseWeight,
      decayRate: record.decayRate,
      horizon: record.horizon,
    })),
  ];

  if (edgesToCreate.length > 0) {
    await prisma.impactEdge.createMany({ data: edgesToCreate });
  }
}

export async function ingestRawRecord(
  record: RawSourceRecord
): Promise<"created" | "merged" | "skipped" | "duplicate_url"> {
  if (record.sectors.length === 0 && record.tickers.length === 0) {
    return "skipped";
  }

  if (record.originRecordId) {
    const existing = await prisma.catalystSource.findUnique({
      where: { originRecordId: record.originRecordId },
    });
    if (existing) return "skipped";
  }

  // ★MỚI: kiểm tra URL CHÍNH XÁC trước — nhanh hơn (index unique trên DB) và
  // đáng tin cậy hơn heuristic 36h. Nếu đã ingest đúng URL này rồi, dừng ngay.
  const duplicateCheck = await isDuplicateByUrl(record.sourceUrl);
  if (duplicateCheck.isDuplicate) {
    return "duplicate_url";
  }

  const match = await findMatchingSource(record);

  if (match) {
    await mergeIntoExisting(match.id, record);
    return "merged";
  }

  await createNew(record);
  return "created";
}

export async function ingestBatch(records: RawSourceRecord[]): Promise<IngestSummary> {
  const summary: IngestSummary = {
    createdCount: 0, mergedCount: 0, skippedCount: 0, duplicateUrlCount: 0, errorCount: 0,
  };

  for (const record of records) {
    try {
      const result = await ingestRawRecord(record);
      if (result === "created") summary.createdCount++;
      else if (result === "merged") summary.mergedCount++;
      else if (result === "duplicate_url") summary.duplicateUrlCount++;
      else summary.skippedCount++;
    } catch (err) {
      console.error(`Loi ingest record "${record.title}":`, err);
      summary.errorCount++;
    }
  }

  return summary;
}
