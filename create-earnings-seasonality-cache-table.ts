// create-earnings-seasonality-cache-table.ts
// Tao bang EarningsSeasonalityCache TRUC TIEP bang raw SQL (cung quy uoc create-dividend-event-cache-table.ts:
// KHONG dung prisma migrate de tranh drift voi cac bang tao bang SQL truoc do; KHONG dung den du lieu hien co).
// Chay 1 lan: npx tsx create-earnings-seasonality-cache-table.ts
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EarningsSeasonalityCache" (
      "ticker" TEXT PRIMARY KEY,
      "sector" TEXT,
      "announceDates" JSONB NOT NULL,
      "samples" JSONB NOT NULL,
      "paths" JSONB NOT NULL,
      "stats" JSONB,
      "calendar" JSONB,
      "earningsSignal" JSONB,
      "priceSource" TEXT,
      "notes" JSONB,
      "collectedAt" TIMESTAMP(3) NOT NULL,
      "finalizedAt" TIMESTAMP(3)
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EarningsSeasonalityCache_collectedAt_idx" ON "EarningsSeasonalityCache"("collectedAt");`);
  console.log("Da tao bang EarningsSeasonalityCache (khong dung gi den du lieu hien co).");
  console.log("So dong hien co:", await prisma.earningsSeasonalityCache.count());
}

main().then(() => process.exit(0)).catch((e) => { console.error("LOI:", e); process.exit(1); });
