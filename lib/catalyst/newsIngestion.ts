// lib/catalyst/newsIngestion.ts — PHASE 1 UPGRADE
// Da thay the bang anh xa tinh SECTOR_KEY_TO_DISPLAY_NAME + kiem tra thu cong
// "Macro_General" bang resolveSectorName() cua SectorRegistry - co 3 lop phong
// thu tu chua lanh, khong bao gio leak ten nganh sai ngon ngu ra UI nua.

import { prisma } from "@/lib/prisma";
import type { CatalystCategory, PropagationDistance, Horizon, ImpactDirection } from "./types";
import { resolveSectorName } from "./engine/SectorRegistry";

const TYPE_TO_CATEGORY: Record<string, CatalystCategory> = {
  "Chinh sach SBV": "regulatory",
  "Chinh sach dat dai": "regulatory",
  "Hang hoa & Van tai": "macro",
  "Hang hoa the gioi": "macro",
  "Ty gia & Lien thi truong": "macro",
};

function mapCategory(type: string): CatalystCategory {
  return TYPE_TO_CATEGORY[type] ?? "macro";
}

function mapSeverity(severity: string): { decayRate: number; horizon: Horizon } {
  switch (severity) {
    case "critical":
      return { decayRate: 0.05, horizon: "long" };
    case "high":
      return { decayRate: 0.08, horizon: "long" };
    case "low":
      return { decayRate: 0.25, horizon: "short" };
    default:
      return { decayRate: 0.15, horizon: "medium" };
  }
}

function directionFromImpact(rawImpact: number): ImpactDirection {
  return rawImpact >= 0 ? "benefit" : "harm";
}

function clampWeight(rawImpact: number): number {
  return Math.max(1, Math.min(10, Math.abs(rawImpact)));
}

const DEFAULT_PROPAGATION: PropagationDistance = "direct";

export interface IngestResult {
  convertedCount: number;
  skippedCount: number;
  errorCount: number;
  unmappedSectorCount: number; // ★MỚI: đếm số lần gặp ngành chưa ánh xạ (quarantine)
}

export async function ingestFromMacroNews(limit = 50): Promise<IngestResult> {
  const unconverted = await prisma.macroNewsRecord.findMany({
    where: {
      NOT: {
        id: {
          in: (
            await prisma.catalystSource.findMany({
              where: { originRecordId: { not: null } },
              select: { originRecordId: true },
            })
          ).map((s) => s.originRecordId as string),
        },
      },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  let convertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let unmappedSectorCount = 0;

  for (const record of unconverted) {
    try {
      const { decayRate, horizon } = mapSeverity(record.severity);
      const direction = directionFromImpact(record.rawImpact);
      const baseWeight = clampWeight(record.rawImpact);
      const category = mapCategory(record.type);

      // ★MỚI: dùng SectorRegistry self-healing thay vì bảng ánh xạ tay + check thủ công
      const resolvedSectors: string[] = [];
      for (const rawSector of record.affectedSectors ?? []) {
        const resolution = await resolveSectorName(rawSector);
        if (resolution.wasUnmapped) unmappedSectorCount++;
        if (resolution.displayName) resolvedSectors.push(resolution.displayName);
      }

      if (!resolvedSectors.length && !record.relatedTickers?.length) {
        skippedCount++;
        continue;
      }

      const source = await prisma.catalystSource.upsert({
        where: { originRecordId: record.id },
        update: {},
        create: {
          title: record.headline,
          category,
          sourceCredibility: "confirmed",
          publishedDate: record.publishedAt,
          firstDetectedAt: record.fetchedAt,
          corroborationCount: 1,
          originRecordId: record.id,
        },
      });

      const edgesToCreate = [
        ...resolvedSectors.map((sector) => ({
          sourceId: source.id,
          targetType: "sector" as const,
          targetId: sector,
          direction,
          propagationDistance: DEFAULT_PROPAGATION,
          hopCount: 1,
          baseWeight,
          decayRate,
          horizon,
        })),
        ...(record.relatedTickers ?? []).map((ticker) => ({
          sourceId: source.id,
          targetType: "ticker" as const,
          targetId: ticker,
          direction,
          propagationDistance: DEFAULT_PROPAGATION,
          hopCount: 1,
          baseWeight,
          decayRate,
          horizon,
        })),
      ];

      if (edgesToCreate.length > 0) {
        await prisma.impactEdge.createMany({ data: edgesToCreate });
      }

      convertedCount++;
    } catch (err) {
      console.error(`Loi convert MacroNewsRecord ${record.id}:`, err);
      errorCount++;
    }
  }

  return { convertedCount, skippedCount, errorCount, unmappedSectorCount };
}
