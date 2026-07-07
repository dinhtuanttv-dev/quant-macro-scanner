-- AlterTable
ALTER TABLE "CatalystSource" ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "targetPrice" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SourceReference" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceReference_sourceId_idx" ON "SourceReference"("sourceId");

-- AddForeignKey
ALTER TABLE "SourceReference" ADD CONSTRAINT "SourceReference_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CatalystSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
