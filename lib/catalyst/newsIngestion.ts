// lib/catalyst/newsIngestion.ts
// Chuyển đổi các dòng MacroNewsRecord (đã có sẵn, do cron /api/cron/macro-news đổ vào)
// thành CatalystSource + ImpactEdge. Idempotent: dùng originRecordId để không convert trùng.

import { prisma } from "@/lib/prisma"; // đổi đúng đường dẫn nếu khác
import type { CatalystCategory, PropagationDistance, Horizon, ImpactDirection } from "./types";

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

// classifySectors() trong lib/macro/classifier.ts trả về tên ngành TIẾNG ANH
// (Banking, Steel, Oil_Gas...) — khác với tên tiếng Việt dùng xuyên suốt hệ thống
// (Thep, Bat dong san, Dau khi...). Ánh xạ lại ở đây để gộp đúng cùng 1 ngành,
// KHÔNG sửa classifier.ts vì file đó đang phục vụ các tính năng khác đã chạy sẵn.
const SECTOR_KEY_TO_DISPLAY_NAME: Record<string, string> = {
  Banking: "Ngan hang",
  RealEstate: "Bat dong san",
  Steel: "Thep",
  Oil_Gas: "Dau khi",
  Securities: "Chung khoan",
  Export_Textile: "Det may",
  Technology: "Cong nghe",
  Agriculture: "Nong san",
};

// "Macro_General" là giá trị fallback của classifySectors() khi không khớp từ khoá ngành nào
// -> không phải 1 ngành thật, phải loại bỏ khỏi sector-edge (nhưng vẫn giữ ticker-edge nếu có).
const NON_SECTOR_FALLBACK = "Macro_General";

function mapSectorName(rawSector: string): string | null {
  if (rawSector === NON_SECTOR_FALLBACK) return null;
  return SECTOR_KEY_TO_DISPLAY_NAME[rawSector] ?? rawSector;
}

// toSeverity() trong classifier.ts trả về đủ 4 mức, bao gồm "critical" — xử lý đủ cả 4.
function mapSeverity(severity: string): { decayRate: number; horizon: Horizon } {
  switch (severity) {
    case "critical":
      return { decayRate: 0.05, horizon: "long" };
    case "high":
      return { decayRate: 0.08, horizon: "long" };
    case "low":
      return { decayRate: 0.25, horizon: "short" };
    default: // "medium"
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

  for (const record of unconverted) {
    try {
      const { decayRate, horizon } = mapSeverity(record.severity);
      const direction = directionFromImpact(record.rawImpact);
      const baseWeight = clampWeight(record.rawImpact);
      const category = mapCategory(record.type);

      const mappedSectors = (record.affectedSectors ?? [])
        .map(mapSectorName)
        .filter((s): s is string => s !== null);

      if (!mappedSectors.length && !record.relatedTickers?.length) {
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
        ...mappedSectors.map((sector) => ({
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

  return { convertedCount, skippedCount, errorCount };
}