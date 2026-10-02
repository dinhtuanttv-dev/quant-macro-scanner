// create-cotuc-decision-tables.ts
// Tao 2 bang CotucDecisionState + CotucSignalTrack TRUC TIEP bang raw SQL (cung quy uoc create-earnings-seasonality-cache-table.ts:
// KHONG dung prisma migrate; CREATE TABLE IF NOT EXISTS - KHONG dung den du lieu hien co).
// Chay 1 lan: npx tsx create-cotuc-decision-tables.ts
import { prisma } from "./lib/prisma";

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CotucDecisionState" (
      "ticker" TEXT PRIMARY KEY,
      "level" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "combinedProbability" DOUBLE PRECISION NOT NULL,
      "snapshot" JSONB NOT NULL,
      "computedAt" TIMESTAMP(3) NOT NULL
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CotucDecisionState_computedAt_idx" ON "CotucDecisionState"("computedAt");`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CotucSignalTrack" (
      "id" TEXT PRIMARY KEY,
      "ticker" TEXT NOT NULL,
      "windowId" TEXT NOT NULL,
      "level" TEXT NOT NULL,
      "predictedProbability" DOUBLE PRECISION NOT NULL,
      "components" JSONB NOT NULL,
      "exDate" TEXT NOT NULL,
      "exDateStatus" TEXT NOT NULL,
      "entryDate" TEXT NOT NULL,
      "plannedExitDate" TEXT NOT NULL,
      "issuedAt" TIMESTAMP(3) NOT NULL,
      "outcome" INTEGER,
      "realizedCar" DOUBLE PRECISION,
      "exitDate" TEXT,
      "outcomeRecordedAt" TIMESTAMP(3)
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CotucSignalTrack_ticker_idx" ON "CotucSignalTrack"("ticker");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CotucSignalTrack_issuedAt_idx" ON "CotucSignalTrack"("issuedAt");`);
  console.log("Da tao bang CotucDecisionState + CotucSignalTrack (khong dung gi den du lieu hien co).");
  console.log("So dong:", await prisma.cotucDecisionState.count(), "/", await prisma.cotucSignalTrack.count());
}

main().then(() => process.exit(0)).catch((e) => { console.error("LOI:", e); process.exit(1); });
